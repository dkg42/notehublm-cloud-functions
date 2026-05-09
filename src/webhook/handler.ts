import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { logger } from 'firebase-functions/v2';
import { verifyWebhookSignature, WebhookVerificationError } from './verify';
import {
  tryClaimWebhookId,
  addUpsertCustomerDoc,
  getCustomerDoc,
} from '../firebase/firestore';
import { resolveFirebaseUid } from '../firebase/userLookup';
import { setSubscriptionClaims, buildClaimsFromCustomerDoc } from '../firebase/claims';
import { db, FieldValue } from '../firebase/admin';
import { routeSubscriptionEvent } from '../events/subscription';
import { handlePaymentSucceeded, handlePaymentFailed, handleRefundSucceeded } from '../events/payment';
import type {
  DodoWebhookPayload,
  SubscriptionEventData,
  SubscriptionResult,
  PaymentEventData,
  RefundEventData,
} from '../types';

export async function webhookHandler(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawBody = req.rawBody.toString('utf8');
  const signature = (req.headers['webhook-signature'] as string) ?? '';
  const timestamp = (req.headers['webhook-timestamp'] as string) ?? '';
  const webhookId = (req.headers['webhook-id'] as string) ?? '';

  try {
    verifyWebhookSignature(rawBody, {
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      logger.warn('[webhook] Signature verification failed', { error: err.message, webhookId });
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
    throw err;
  }

  if (webhookId) {
    const claimed = await tryClaimWebhookId(webhookId);
    if (!claimed) {
      logger.info('[webhook] Duplicate event — skipping', { webhookId });
      res.json({ received: true });
      return;
    }
  }

  const event = JSON.parse(rawBody) as DodoWebhookPayload;
  const eventType = event.type;

  logger.info('[webhook] Processing event', { eventType, webhookId });

  const eventData = event.data as { customer: { customer_id: string; email: string } };
  const customerId = eventData.customer.customer_id;
  const email = eventData.customer.email;

  const uid = await resolveFirebaseUid(customerId, email);

  let subscriptionResult: SubscriptionResult | null = null;

  if (eventType.startsWith('subscription.')) {
    subscriptionResult = routeSubscriptionEvent(eventType, event.data as SubscriptionEventData);
    if (!subscriptionResult) {
      logger.warn('[webhook] Unhandled subscription event type', { eventType });
    }
  } else if (eventType === 'payment.succeeded') {
    handlePaymentSucceeded(event.data as PaymentEventData);
  } else if (eventType === 'payment.failed') {
    const paymentData = event.data as PaymentEventData;
    handlePaymentFailed(paymentData);
    if (paymentData.subscription_id) {
      const existing = await getCustomerDoc(customerId);
      if (existing?.subscriptionStatus === 'active') {
        subscriptionResult = {
          subscriptionStatus: 'on_hold',
          subscriptionPlan: existing.subscriptionPlan,
          subscriptionId: paymentData.subscription_id,
          currentPeriodEnd: existing.currentPeriodEnd,
        };
      }
    }
  } else if (eventType === 'refund.succeeded') {
    handleRefundSucceeded(event.data as RefundEventData);
  } else {
    logger.info('[webhook] Unhandled event type', { eventType });
  }

  const batch = db.batch();

  if (subscriptionResult) {
    const { subscriptionStatus, subscriptionPlan, subscriptionId, currentPeriodEnd } =
      subscriptionResult;

    addUpsertCustomerDoc(batch, customerId, {
      email,
      firebaseUid: uid,
      subscriptionStatus,
      subscriptionPlan,
      subscriptionId,
      currentPeriodEnd,
      lastWebhookEvent: eventType,
    });

  } else if (uid) {
    // For non-subscription events: backfill firebaseUid in the customer doc if it exists
    try {
      await db.collection('customers').doc(customerId).set(
        { email, firebaseUid: uid },
        { merge: true }
      );
    } catch (err) {
      logger.error('[webhook] Failed to backfill firebaseUid in customer doc', {
        customerId,
        uid,
        webhookId,
        eventType,
        error: (err as Error).message,
      });
      res.status(500).json({ error: 'Firestore write failed' });
      return;
    }
  }

  if (webhookId) {
    batch.update(db.collection('webhook_events').doc(webhookId), {
      processedAt: FieldValue.serverTimestamp(),
      eventType,
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    logger.error('[webhook] Failed to commit Firestore batch', {
      customerId,
      webhookId,
      eventType,
      error: (err as Error).message,
    });
    res.status(500).json({ error: 'Firestore write failed' });
    return;
  }

  if (uid && subscriptionResult) {
    try {
      await setSubscriptionClaims(
        uid,
        buildClaimsFromCustomerDoc(customerId, subscriptionResult)
      );
    } catch (err) {
      logger.warn('[webhook] Failed to set subscription claims — subscription data committed, will refresh on next login', {
        uid,
        customerId,
        webhookId,
        eventType,
        error: (err as Error).message,
      });
    }
  }

  res.json({ received: true });
}
