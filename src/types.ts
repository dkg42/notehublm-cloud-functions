import type { firestore } from 'firebase-admin';

export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'on_hold' | 'none';
export type SubscriptionPlan = 'pro_monthly' | 'pro_yearly';

export interface SubscriptionClaims {
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionId: string | null;
  customerId: string | null;
  currentPeriodEnd: string | null;
}

// Firestore: customers/{dodoCustomerId}
export interface CustomerDoc {
  email: string;
  firebaseUid: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
  updatedAt: firestore.Timestamp;
  lastWebhookEvent: string;
}

// Firestore: user_tokens/{uid}
export interface UserTokenDoc {
  googleRefreshToken: string;
  scope: string;
  updatedAt: firestore.Timestamp;
}

// Firestore: webhook_events/{webhookId}
export interface WebhookEventDoc {
  processedAt: firestore.Timestamp;
  eventType: string;
}

export interface DodoCustomer {
  customer_id: string;
  email: string;
  name?: string;
}

export interface SubscriptionEventData {
  subscription_id: string;
  customer: DodoCustomer;
  product_id: string;
  status: string;
  next_billing_date?: string;
  cancelled_at?: string;
  cancel_at_next_billing_date?: boolean;
}

export interface PaymentEventData {
  payment_id: string;
  customer: DodoCustomer;
  subscription_id?: string;
  total_amount: number;
  currency: string;
  error_message?: string;
}

export interface RefundEventData {
  refund_id: string;
  payment_id: string;
  customer: DodoCustomer;
  amount: number;
}

export interface DodoWebhookPayload {
  business_id: string;
  type: string;
  timestamp: string;
  data: SubscriptionEventData | PaymentEventData | RefundEventData;
}

export interface SubscriptionResult {
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
}
