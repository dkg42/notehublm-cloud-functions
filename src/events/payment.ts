import { logger } from 'firebase-functions/v2';
import type { PaymentEventData, RefundEventData } from '../types';

export function handlePaymentSucceeded(data: PaymentEventData): void {
  logger.info('[payment] Succeeded', {
    paymentId: data.payment_id,
    customerId: data.customer.customer_id,
    email: data.customer.email,
    amount: data.total_amount,
    currency: data.currency,
    subscriptionId: data.subscription_id ?? null,
  });
}

export function handlePaymentFailed(data: PaymentEventData): void {
  logger.warn('[payment] Failed', {
    paymentId: data.payment_id,
    customerId: data.customer.customer_id,
    email: data.customer.email,
    errorMessage: data.error_message ?? null,
  });
}

export function handleRefundSucceeded(data: RefundEventData): void {
  logger.info('[refund] Succeeded', {
    refundId: data.refund_id,
    paymentId: data.payment_id,
    customerId: data.customer.customer_id,
    amount: data.amount,
  });
}
