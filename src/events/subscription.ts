import { productIdToPlan } from '../config';
import type { SubscriptionEventData, SubscriptionResult } from '../types';

export function handleSubscriptionActive(data: SubscriptionEventData): SubscriptionResult {
  return {
    subscriptionStatus: 'active',
    subscriptionPlan: productIdToPlan(data.product_id),
    subscriptionId: data.subscription_id,
    currentPeriodEnd: data.next_billing_date ?? null,
  };
}

export function handleSubscriptionRenewed(data: SubscriptionEventData): SubscriptionResult {
  return {
    subscriptionStatus: 'active',
    subscriptionPlan: productIdToPlan(data.product_id),
    subscriptionId: data.subscription_id,
    currentPeriodEnd: data.next_billing_date ?? null,
  };
}

export function handleSubscriptionPlanChanged(data: SubscriptionEventData): SubscriptionResult {
  return {
    subscriptionStatus: 'active',
    subscriptionPlan: productIdToPlan(data.product_id),
    subscriptionId: data.subscription_id,
    currentPeriodEnd: data.next_billing_date ?? null,
  };
}

export function handleSubscriptionCancelled(data: SubscriptionEventData): SubscriptionResult {
  return {
    subscriptionStatus: 'cancelled',
    subscriptionPlan: productIdToPlan(data.product_id),
    subscriptionId: data.subscription_id,
    // Keep period end so the extension can show "access until X"
    currentPeriodEnd: data.next_billing_date ?? null,
  };
}

export function handleSubscriptionExpired(data: SubscriptionEventData): SubscriptionResult {
  return {
    subscriptionStatus: 'expired',
    subscriptionPlan: null,
    subscriptionId: data.subscription_id,
    currentPeriodEnd: null,
  };
}

export function handleSubscriptionOnHold(data: SubscriptionEventData): SubscriptionResult {
  return {
    subscriptionStatus: 'on_hold',
    subscriptionPlan: productIdToPlan(data.product_id),
    subscriptionId: data.subscription_id,
    currentPeriodEnd: data.next_billing_date ?? null,
  };
}

export function handleSubscriptionFailed(data: SubscriptionEventData): SubscriptionResult {
  return {
    subscriptionStatus: 'none',
    subscriptionPlan: null,
    subscriptionId: data.subscription_id,
    currentPeriodEnd: null,
  };
}

export function routeSubscriptionEvent(
  eventType: string,
  data: SubscriptionEventData
): SubscriptionResult | null {
  switch (eventType) {
    case 'subscription.active':
      return handleSubscriptionActive(data);
    case 'subscription.renewed':
      return handleSubscriptionRenewed(data);
    case 'subscription.plan_changed':
      return handleSubscriptionPlanChanged(data);
    case 'subscription.cancelled':
      return handleSubscriptionCancelled(data);
    case 'subscription.expired':
      return handleSubscriptionExpired(data);
    case 'subscription.on_hold':
      return handleSubscriptionOnHold(data);
    case 'subscription.failed':
      return handleSubscriptionFailed(data);
    default:
      return null;
  }
}
