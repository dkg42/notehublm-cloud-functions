import { productIdToPlan } from '../config';
import type { SubscriptionEventData, SubscriptionResult, SubscriptionStatus } from '../types';

interface EventMapping {
  status: SubscriptionStatus;
  clearPlan: boolean;
  clearPeriodEnd: boolean;
}

const STATUS_BY_EVENT: Record<string, EventMapping> = {
  // Active states — keep plan + period end so the client can show "renews on X"
  'subscription.active':       { status: 'active',    clearPlan: false, clearPeriodEnd: false },
  'subscription.renewed':      { status: 'active',    clearPlan: false, clearPeriodEnd: false },
  'subscription.plan_changed': { status: 'active',    clearPlan: false, clearPeriodEnd: false },
  // Cancelled — keep period end so the client can show "access until X"
  'subscription.cancelled':    { status: 'cancelled', clearPlan: false, clearPeriodEnd: false },
  'subscription.on_hold':      { status: 'on_hold',   clearPlan: false, clearPeriodEnd: false },
  // Terminal states — clear plan + period end
  'subscription.expired':      { status: 'expired',   clearPlan: true,  clearPeriodEnd: true  },
  'subscription.failed':       { status: 'none',      clearPlan: true,  clearPeriodEnd: true  },
};

export function routeSubscriptionEvent(
  eventType: string,
  data: SubscriptionEventData
): SubscriptionResult | null {
  const mapping = STATUS_BY_EVENT[eventType];
  if (!mapping) return null;

  return {
    subscriptionStatus: mapping.status,
    subscriptionPlan: mapping.clearPlan ? null : productIdToPlan(data.product_id),
    subscriptionId: data.subscription_id,
    currentPeriodEnd: mapping.clearPeriodEnd ? null : (data.next_billing_date ?? null),
  };
}
