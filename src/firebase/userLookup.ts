import { logger } from 'firebase-functions/v2';
import { auth } from './admin';
import { getCustomerDoc } from './firestore';

export async function resolveFirebaseUid(
  customerId: string,
  email: string
): Promise<string | null> {
  const customerDoc = await getCustomerDoc(customerId);
  if (customerDoc?.firebaseUid) {
    return customerDoc.firebaseUid;
  }

  try {
    const user = await auth.getUserByEmail(email);
    return user.uid;
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'auth/user-not-found') {
      logger.info('[userLookup] No Firebase user found for email — storing subscription without UID', { email });
      return null;
    }
    throw err;
  }
}
