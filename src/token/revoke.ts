import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { logger } from 'firebase-functions/v2';
import { getUserToken, deleteUserToken } from '../firebase/firestore';
import { verifyAuthHeader } from './verify-firebase-token';

const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export async function revokeGoogleTokenHandler(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const uid = await verifyAuthHeader(req.headers.authorization);
  if (!uid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const tokenDoc = await getUserToken(uid);

  if (tokenDoc?.googleRefreshToken) {
    try {
      await fetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tokenDoc.googleRefreshToken }),
      });
    } catch (err) {
      // Revocation is best-effort — log and continue to Firestore cleanup
      logger.warn('[revokeGoogleToken] Revocation request failed (continuing cleanup)', { uid, err });
    }
  }

  await deleteUserToken(uid);
  logger.info('[revokeGoogleToken] Token revoked and deleted', { uid });
  res.json({ success: true });
}
