import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { logger } from 'firebase-functions/v2';
import { getUserToken, saveUserToken, deleteUserToken } from '../firebase/firestore';
import { verifyAuthHeader } from './verify-firebase-token';
import { googleClientId, googleClientSecret } from '../config';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  refresh_token?: string;
}

export async function refreshGoogleTokenHandler(req: Request, res: Response): Promise<void> {
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
  if (!tokenDoc) {
    res.status(404).json({ error: 'No stored token found for this user' });
    return;
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
    res.status(502).json({ error: 'Failed to reach Google token endpoint' });
    return;
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
      res.status(401).json({ error: 'invalid_grant', message: body.error_description });
    } else {
      res.status(502).json({ error: body.error ?? 'token_refresh_failed', message: body.error_description });
    }
    return;
  }

  // If Google rotated the refresh token, persist the new one
  if (body.refresh_token && body.refresh_token !== tokenDoc.googleRefreshToken) {
    await saveUserToken(uid, body.refresh_token, body.scope ?? tokenDoc.scope);
    logger.info('[refreshGoogleToken] Refresh token rotated', { uid });
  }

  logger.info('[refreshGoogleToken] Token refreshed', { uid });
  res.json({
    accessToken: body.access_token,
    expiresIn: body.expires_in,
    scope: body.scope,
  });
}
