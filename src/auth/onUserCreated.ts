import { logger } from 'firebase-functions/v2';
import { db } from '../firebase/admin';
import {
  queryCustomerByEmail,
  addLinkUidToCustomer,
} from '../firebase/firestore';
import { setSubscriptionClaims, buildClaimsFromCustomerDoc } from '../firebase/claims';

interface UserRecord {
  uid: string;
  email?: string;
}

export async function onUserCreatedHandler(user: UserRecord): Promise<void> {
  const { uid, email } = user;

  if (!email) {
    logger.info('[onUserCreated] User has no email, skipping subscription lookup', { uid });
    return;
  }

  const match = await queryCustomerByEmail(email);
  if (!match) {
    logger.info('[onUserCreated] No existing Dodo customer found for email', { email });
    return;
  }

  const { id: customerId, data: customerData } = match;

  if (!customerData.subscriptionStatus || customerData.subscriptionStatus === 'none') {
    logger.info('[onUserCreated] Customer found but has no subscription', { customerId });
    return;
  }

  logger.info('[onUserCreated] Linking Firebase user to existing customer subscription', {
    uid,
    customerId,
    subscriptionStatus: customerData.subscriptionStatus,
  });

  const batch = db.batch();
  addLinkUidToCustomer(batch, customerId, uid);

  try {
    await batch.commit();
  } catch (err) {
    logger.error('[onUserCreated] Failed to link Firebase UID to customer doc — will be resolved by next subscription webhook', {
      uid,
      customerId,
      error: (err as Error).message,
    });
    return;
  }

  try {
    await setSubscriptionClaims(uid, buildClaimsFromCustomerDoc(customerId, customerData));
  } catch (err) {
    logger.warn('[onUserCreated] Failed to set subscription claims — will refresh on next login or webhook', {
      uid,
      customerId,
      error: (err as Error).message,
    });
  }
}
