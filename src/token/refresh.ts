import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getUserToken, saveUserToken, deleteUserToken } from '../firebase/firestore';
import { googleClientId, googleClientSecret } from '../config';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  refresh_token?: string;
}

export async function refreshGoogleTokenHandler(request: CallableRequest<unknown>): Promise<{
  accessToken: string;
  expiresIn: number;
  scope: string;
}> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign-in required');
  }

  const tokenDoc = await getUserToken(uid);
  if (!tokenDoc) {
    throw new HttpsError('not-found', 'No stored token found for this user');
  }

  let response: globalThis.Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenDoc.googleRefreshToken,
        client_id: googleClientId.value(),
        client_secret: googleClientSecret.value(),
      }),
    });
  } catch (err) {
    logger.error('[refreshGoogleToken] Network error calling Google token endpoint', { uid, err });
    throw new HttpsError('unavailable', 'Failed to reach Google token endpoint');
  }

  const body = await response.json() as GoogleTokenResponse & { error?: string; error_description?: string };

  if (!response.ok) {
    logger.warn('[refreshGoogleToken] Google token endpoint error', { uid, error: body.error });
    if (body.error === 'invalid_grant') {
      // Refresh token is revoked or expired — clean up Firestore (best-effort)
      await deleteUserToken(uid).catch((deleteErr: unknown) => {
        logger.warn('[refreshGoogleToken] Failed to delete revoked token doc', {
          uid,
          error: (deleteErr as Error).message,
        });
      });
      throw new HttpsError('unauthenticated', 'invalid_grant', { message: body.error_description });
    }
    throw new HttpsError('unavailable', body.error ?? 'token_refresh_failed', { message: body.error_description });
  }

  // If Google rotated the refresh token, persist the new one
  if (body.refresh_token && body.refresh_token !== tokenDoc.googleRefreshToken) {
    await saveUserToken(uid, body.refresh_token, body.scope ?? tokenDoc.scope);
    logger.info('[refreshGoogleToken] Refresh token rotated', { uid });
  }

  logger.info('[refreshGoogleToken] Token refreshed', { uid });
  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in,
    scope: body.scope,
  };
}
