import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { logger } from 'firebase-functions/v2';
import DodoPayments from 'dodopayments';
import { db } from '../firebase/admin';
import {
  addMarkWebhookProcessed,
  addUpsertCustomerDoc,
} from '../firebase/firestore';
import { resolveFirebaseUid } from '../firebase/userLookup';
import { setSubscriptionClaims, buildClaimsFromCustomerDoc } from '../firebase/claims';
import { config, productIdToPlan } from '../config';
import { checkAdminSecret } from './auth';
import type { SubscriptionResult, SubscriptionStatus } from '../types';

interface ReplayBody {
  customerId: string;
  subscriptionId?: string;
}

// Maps Dodo API subscription status to our internal SubscriptionStatus
function mapApiStatus(status: string): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'renewed':
    case 'trial':
      return 'active';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'on_hold':
      return 'on_hold';
    default:
      return 'none';
  }
}

export async function replayWebhookHandler(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!checkAdminSecret(req, res)) return;

  const { customerId, subscriptionId } = req.body as ReplayBody;
  if (!customerId) {
    res.status(400).json({ error: 'customerId is required' });
    return;
  }

  logger.info('[adminReplayWebhook] Fetch requested', { customerId, subscriptionId });

  const dodo = new DodoPayments({
    bearerToken: config.dodoApiKey,
    environment: config.dodoEnv,
  });

  // Fetch subscription(s) from Dodo
  let sub: { subscription_id: string; status: string; product_id: string; next_billing_date?: string | null; customer: { customer_id: string; email: string } };

  if (subscriptionId) {
    sub = await dodo.subscriptions.retrieve(subscriptionId) as typeof sub;
  } else {
    const list = await dodo.subscriptions.list({ customer_id: customerId });
    // Prefer active subscription, otherwise take the most recent
    const items = list.items as (typeof sub)[];
    if (!items.length) {
      res.status(404).json({ error: `No subscriptions found for customerId: ${customerId}` });
      return;
    }
    sub = items.find(s => s.status === 'active') ?? items[0]!;
  }

  const internalStatus = mapApiStatus(sub.status);
  const subscriptionResult: SubscriptionResult = {
    subscriptionStatus: internalStatus,
    subscriptionPlan: internalStatus !== 'none' && internalStatus !== 'expired'
      ? productIdToPlan(sub.product_id)
      : null,
    subscriptionId: sub.subscription_id,
    currentPeriodEnd: sub.next_billing_date ?? null,
  };

  const email = sub.customer.email;
  const uid = await resolveFirebaseUid(customerId, email);

  const batch = db.batch();
  addUpsertCustomerDoc(batch, customerId, {
    email,
    firebaseUid: uid,
    subscriptionStatus: subscriptionResult.subscriptionStatus,
    subscriptionPlan: subscriptionResult.subscriptionPlan,
    subscriptionId: subscriptionResult.subscriptionId,
    currentPeriodEnd: subscriptionResult.currentPeriodEnd,
    lastWebhookEvent: 'admin.replay',
  });
  // Mark a synthetic webhook ID so this replay is idempotent
  addMarkWebhookProcessed(batch, `admin_replay_${customerId}`, 'admin.replay');

  try {
    await batch.commit();
  } catch (err) {
    logger.error('[adminReplayWebhook] Firestore batch commit failed', {
      customerId,
      error: (err as Error).message,
    });
    res.status(500).json({ error: 'Firestore write failed' });
    return;
  }

  if (uid) {
    try {
      await setSubscriptionClaims(uid, buildClaimsFromCustomerDoc(customerId, subscriptionResult));
    } catch (err) {
      logger.warn('[adminReplayWebhook] Firestore committed but claims update failed', {
        uid, customerId, error: (err as Error).message,
      });
    }
  }

  logger.info('[adminReplayWebhook] Replay succeeded', { customerId, uid, status: internalStatus });
  res.json({ success: true, customerId, uid, subscriptionStatus: internalStatus });
}
