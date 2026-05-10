import { defineSecret, defineString } from 'firebase-functions/params';
import type { SubscriptionPlan } from './types';

export const dodoWebhookSecret = defineSecret('DODO_PAYMENTS_WEBHOOK_SECRET');
export const dodoApiKey = defineSecret('DODO_PAYMENTS_API_KEY');
export const googleClientId = defineString('GOOGLE_CLIENT_ID');
export const googleClientSecret = defineSecret('GOOGLE_CLIENT_SECRET');
export const dodoProductIdProMonthly = defineString('DODO_PRODUCT_ID_PRO_MONTHLY');
export const dodoProductIdProYearly = defineString('DODO_PRODUCT_ID_PRO_YEARLY');
export const dodoEnv = defineString('DODO_ENV', { default: 'test_mode' });

export function productIdToPlan(productId: string): SubscriptionPlan | null {
  if (productId === dodoProductIdProMonthly.value()) return 'pro_monthly';
  if (productId === dodoProductIdProYearly.value()) return 'pro_yearly';
  console.warn(`[config] Unknown product ID: ${productId}`);
  return null;
}
