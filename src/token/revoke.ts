import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getUserToken, deleteUserToken } from '../firebase/firestore';

const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export async function revokeGoogleTokenHandler(request: CallableRequest<unknown>): Promise<{ success: true }> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign-in required');
  }

  const tokenDoc = await getUserToken(uid);

  if (tokenDoc?.googleRefreshToken) {
    try {
      const response = await fetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tokenDoc.googleRefreshToken }),
      });
      if (!response.ok) {
        logger.info('[revokeGoogleToken] Google returned non-OK on revoke (continuing cleanup)', {
          uid,
          status: response.status,
        });
      }
    } catch (err) {
      // Revocation is best-effort — log and continue to Firestore cleanup
      logger.warn('[revokeGoogleToken] Revocation request failed (continuing cleanup)', { uid, err });
    }
  }

  await deleteUserToken(uid);
  logger.info('[revokeGoogleToken] Token revoked and deleted', { uid });
  return { success: true };
}
