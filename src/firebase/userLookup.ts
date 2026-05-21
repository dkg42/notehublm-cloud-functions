import { logger } from 'firebase-functions/v2';
import { auth } from './admin';
import { getCustomerDoc } from './firestore';
import type { CustomerDoc } from '../types';

export interface ResolvedCustomer {
  uid: string | null;
  customerDoc: CustomerDoc | null;
}

export async function resolveCustomerAndUid(
  customerId: string,
  email: string
): Promise<ResolvedCustomer> {
  const customerDoc = await getCustomerDoc(customerId);
  if (customerDoc?.firebaseUid) {
    return { uid: customerDoc.firebaseUid, customerDoc };
  }

  try {
    const user = await auth.getUserByEmail(email);
    return { uid: user.uid, customerDoc };
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'auth/user-not-found') {
      logger.info('[userLookup] No Firebase user found for email — storing subscription without UID', { email });
      return { uid: null, customerDoc };
    }
    throw err;
  }
}
