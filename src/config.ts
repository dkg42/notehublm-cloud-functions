import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import type { SubscriptionPlan } from './types';

export const dodoWebhookSecret = defineSecret('DODO_PAYMENTS_WEBHOOK_SECRET');
export const dodoApiKey = defineSecret('DODO_PAYMENTS_API_KEY');
export const googleClientId = defineString('GOOGLE_CLIENT_ID');
export const googleClientSecret = defineSecret('GOOGLE_CLIENT_SECRET');
export const dodoProductIdProMonthly = defineString('DODO_PRODUCT_ID_PRO_MONTHLY');
export const dodoProductIdProYearly = defineString('DODO_PRODUCT_ID_PRO_YEARLY');
export const dodoEnv = defineString('DODO_ENV', { default: 'test_mode' });
// Comma-separated list of origins allowed for the Google OAuth proxy endpoints
// (chrome-extension://<id>, https://app.example.com, ...). Empty falls back to "*".
export const allowedOrigins = defineString('ALLOWED_ORIGINS', { default: '' });

let cachedMonthlyId: string | undefined;
let cachedYearlyId: string | undefined;

export function productIdToPlan(productId: string): SubscriptionPlan | null {
  cachedMonthlyId ??= dodoProductIdProMonthly.value();
  cachedYearlyId ??= dodoProductIdProYearly.value();
  if (productId === cachedMonthlyId) return 'pro_monthly';
  if (productId === cachedYearlyId) return 'pro_yearly';
  logger.warn('[config] Unknown product ID', { productId });
  return null;
}
