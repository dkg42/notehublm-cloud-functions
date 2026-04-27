import type { WriteBatch } from 'firebase-admin/firestore';
import { db, FieldValue } from './admin';
import type { CustomerDoc, SubscriptionStatus, SubscriptionPlan } from '../types';

export async function isWebhookProcessed(webhookId: string): Promise<boolean> {
  const doc = await db.collection('webhook_events').doc(webhookId).get();
  return doc.exists;
}

export function addMarkWebhookProcessed(
  batch: WriteBatch,
  webhookId: string,
  eventType: string
): void {
  batch.set(db.collection('webhook_events').doc(webhookId), {
    processedAt: FieldValue.serverTimestamp(),
    eventType,
  });
}

export async function getCustomerDoc(customerId: string): Promise<CustomerDoc | null> {
  const snap = await db.collection('customers').doc(customerId).get();
  return snap.exists ? (snap.data() as CustomerDoc) : null;
}

export async function queryCustomerByEmail(
  email: string
): Promise<{ id: string; data: CustomerDoc } | null> {
  const snapshot = await db
    .collection('customers')
    .where('email', '==', email)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  if (!doc) return null;
  return { id: doc.id, data: doc.data() as CustomerDoc };
}

export function addUpsertCustomerDoc(
  batch: WriteBatch,
  customerId: string,
  fields: {
    email: string;
    firebaseUid: string | null;
    subscriptionStatus: SubscriptionStatus;
    subscriptionPlan: SubscriptionPlan | null;
    subscriptionId: string | null;
    currentPeriodEnd: string | null;
    lastWebhookEvent: string;
  }
): void {
  batch.set(
    db.collection('customers').doc(customerId),
    { ...fields, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

export function addLinkUidToCustomer(
  batch: WriteBatch,
  customerId: string,
  uid: string
): void {
  batch.update(db.collection('customers').doc(customerId), { firebaseUid: uid });
}
