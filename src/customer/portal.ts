import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import DodoPayments from 'dodopayments';
import { queryCustomerByUid } from '../firebase/firestore';
import { dodoApiKey, dodoEnv } from '../config';

let dodoClient: DodoPayments | undefined;
function getDodo(): DodoPayments {
  return (dodoClient ??= new DodoPayments({
    bearerToken: dodoApiKey.value(),
    environment: dodoEnv.value() as 'live_mode' | 'test_mode',
    timeout: 10_000,
    maxRetries: 1,
  }));
}

export async function createDodoPortalSessionHandler(request: CallableRequest<unknown>): Promise<{ link: string }> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign-in required');
  }

  const customer = await queryCustomerByUid(uid);
  if (!customer || customer.data.subscriptionStatus !== 'active') {
    throw new HttpsError('permission-denied', 'no_active_subscription');
  }

  let session: { link: string };
  try {
    session = await getDodo().customers.customerPortal.create(customer.id) as { link: string };
  } catch (err) {
    logger.error('[createDodoPortalSession] Dodo API call failed', {
      uid,
      customerId: customer.id,
      error: (err as Error).message,
    });
    throw new HttpsError('unavailable', 'dodo_api_error', { message: (err as Error).message });
  }

  logger.info('[createDodoPortalSession] Portal session created', { uid, customerId: customer.id });
  return { link: session.link };
}
