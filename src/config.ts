import type { SubscriptionPlan } from './types';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

export const config = {
  dodoWebhookSecret: requireEnv('DODO_PAYMENTS_WEBHOOK_SECRET'),
  dodoProductIdProMonthly: requireEnv('DODO_PRODUCT_ID_PRO_MONTHLY'),
  dodoProductIdProYearly: requireEnv('DODO_PRODUCT_ID_PRO_YEARLY'),
  dodoApiKey: requireEnv('DODO_PAYMENTS_API_KEY'),
  dodoEnv: (process.env['DODO_ENV'] ?? 'test_mode') as 'live_mode' | 'test_mode',
} as const;

export function productIdToPlan(productId: string): SubscriptionPlan | null {
  if (productId === config.dodoProductIdProMonthly) return 'pro_monthly';
  if (productId === config.dodoProductIdProYearly) return 'pro_yearly';
  console.warn(`[config] Unknown product ID: ${productId}`);
  return null;
}
