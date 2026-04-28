import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { logger } from 'firebase-functions/v2';
import { auth } from '../firebase/admin';
import { getCustomerDoc, queryCustomerByEmail, queryCustomerByUid } from '../firebase/firestore';
import { setSubscriptionClaims, buildClaimsFromCustomerDoc } from '../firebase/claims';
import { checkAdminSecret } from './auth';

interface SyncClaimsBody {
  email?: string;
  uid?: string;
  customerId?: string;
}

export async function syncClaimsHandler(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!checkAdminSecret(req, res)) return;

  const { email, uid, customerId } = req.body as SyncClaimsBody;

  if (!email && !uid && !customerId) {
    res.status(400).json({ error: 'At least one of email, uid, or customerId is required' });
    return;
  }

  logger.info('[adminSyncClaims] Request received', { email, uid, customerId });

  // Path 1: customerId provided
  if (customerId) {
    const doc = await getCustomerDoc(customerId);
    if (!doc) {
      res.status(404).json({ error: `No customer doc found for customerId: ${customerId}` });
      return;
    }
    let resolvedUid = uid ?? doc.firebaseUid;
    if (!resolvedUid && doc.email) {
      try {
        const user = await auth.getUserByEmail(doc.email);
        resolvedUid = user.uid;
      } catch {
        // user not found in Auth
      }
    }
    if (!resolvedUid) {
      res.status(404).json({ error: 'Customer doc exists but no Firebase UID could be resolved' });
      return;
    }
    await setSubscriptionClaims(resolvedUid, buildClaimsFromCustomerDoc(customerId, doc));
    logger.info('[adminSyncClaims] Claims synced via customerId', { customerId, uid: resolvedUid });
    res.json({ success: true, uid: resolvedUid, customerId });
    return;
  }

  // Path 2: email provided
  if (email) {
    const match = await queryCustomerByEmail(email);
    if (!match) {
      res.status(404).json({ error: `No customer doc found for email: ${email}` });
      return;
    }
    let resolvedUid = uid ?? match.data.firebaseUid;
    if (!resolvedUid) {
      try {
        const user = await auth.getUserByEmail(email);
        resolvedUid = user.uid;
      } catch {
        // user not found in Auth
      }
    }
    if (!resolvedUid) {
      res.status(404).json({ error: 'Customer doc found but no Firebase UID could be resolved' });
      return;
    }
    await setSubscriptionClaims(resolvedUid, buildClaimsFromCustomerDoc(match.id, match.data));
    logger.info('[adminSyncClaims] Claims synced via email', { email, customerId: match.id, uid: resolvedUid });
    res.json({ success: true, uid: resolvedUid, customerId: match.id });
    return;
  }

  // Path 3: uid only
  if (uid) {
    const match = await queryCustomerByUid(uid);
    if (!match) {
      res.status(404).json({ error: `No customer doc found for uid: ${uid}` });
      return;
    }
    await setSubscriptionClaims(uid, buildClaimsFromCustomerDoc(match.id, match.data));
    logger.info('[adminSyncClaims] Claims synced via uid', { uid, customerId: match.id });
    res.json({ success: true, uid, customerId: match.id });
    return;
  }

  res.status(500).json({ error: 'Unexpected state' });
}
