import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { logger } from 'firebase-functions/v2';
import DodoPayments from 'dodopayments';
import { verifyAuthHeader } from '../token/verify-firebase-token';
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

export async function createDodoPortalSessionHandler(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const uid = await verifyAuthHeader(req.headers.authorization);
  if (!uid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const customer = await queryCustomerByUid(uid);
  if (!customer || customer.data.subscriptionStatus !== 'active') {
    res.status(403).json({ error: 'no_active_subscription' });
    return;
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
    res.status(502).json({ error: 'dodo_api_error', message: (err as Error).message });
    return;
  }

  logger.info('[createDodoPortalSession] Portal session created', { uid, customerId: customer.id });
  res.json({ link: session.link });
}
