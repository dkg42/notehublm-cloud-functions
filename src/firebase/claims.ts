import { auth } from './admin';
import type { SubscriptionClaims, CustomerDoc } from '../types';

export async function setSubscriptionClaims(
  uid: string,
  claims: SubscriptionClaims
): Promise<void> {
  const user = await auth.getUser(uid);
  const existing = user.customClaims ?? {};
  await auth.setCustomUserClaims(uid, { ...existing, ...claims });
}

export function buildClaimsFromCustomerDoc(
  customerId: string,
  customerData: Pick<CustomerDoc, 'subscriptionStatus' | 'subscriptionPlan' | 'subscriptionId' | 'currentPeriodEnd'>
): SubscriptionClaims {
  return {
    subscriptionStatus: customerData.subscriptionStatus,
    subscriptionPlan: customerData.subscriptionPlan,
    subscriptionId: customerData.subscriptionId,
    customerId,
    currentPeriodEnd: customerData.currentPeriodEnd,
  };
}
