import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { OAuth2Client } from 'google-auth-library';
import { auth } from '../firebase/admin';
import { saveUserToken } from '../firebase/firestore';
import { googleClientId, googleClientSecret } from '../config';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface StoreTokenBody {
  code?: string;
  redirectUri?: string;
}

interface GoogleCodeExchangeResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token: string;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

/**
 * Exchanges a Google OAuth authorization code for tokens, persists the refresh
 * token in Firestore (server-only), and returns a Firebase custom token that the
 * iframe can use to sign in with `signInWithCustomToken`.
 *
 * The flow is:
 *   1. Website calls GIS `initCodeClient({ ux_mode: 'popup', prompt: 'consent' })`
 *      and receives an auth code.
 *   2. Website POSTs `{ code, redirectUri: 'postmessage' }` to this endpoint.
 *      No Firebase ID token is required — the code itself is the credential.
 *   3. We exchange the code with Google (using client_secret), verify the id_token,
 *      look up or create the Firebase user by email, store the refresh token,
 *      and mint a custom token.
 *   4. Website signs into Firebase with the custom token; subsequent token refreshes
 *      go through `refreshGoogleToken`.
 */
export async function storeGoogleTokenHandler(request: CallableRequest<StoreTokenBody>): Promise<{
  customToken: string;
  accessToken: string;
  expiresIn: number;
  scope: string;
}> {
  const { code, redirectUri } = request.data;
  if (!code || !redirectUri) {
    throw new HttpsError('invalid-argument', 'code and redirectUri are required');
  }

  const clientId = googleClientId.value();
  const clientSecret = googleClientSecret.value();

  // 1. Exchange the authorization code for tokens
  let exchange: GoogleCodeExchangeResponse;
  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    exchange = await response.json() as GoogleCodeExchangeResponse;
    if (!response.ok) {
      logger.warn('[storeGoogleToken] Google code exchange failed', {
        error: exchange.error,
        description: exchange.error_description,
      });
      throw new HttpsError('invalid-argument', exchange.error ?? 'code_exchange_failed', {
        message: exchange.error_description,
      });
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error('[storeGoogleToken] Network error during code exchange', { err });
    throw new HttpsError('unavailable', 'Failed to reach Google token endpoint');
  }

  if (!exchange.refresh_token) {
    // Without prompt=consent on the client, Google may skip the refresh_token
    // if this user already granted these scopes recently. Tell the caller to retry.
    logger.warn('[storeGoogleToken] No refresh_token returned from Google');
    throw new HttpsError('failed-precondition', 'missing_refresh_token', {
      message: 'Google did not return a refresh_token. Ensure the client uses prompt=consent.',
    });
  }

  // 2. Verify the id_token and extract user identity
  let payload: { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  try {
    const verifier = new OAuth2Client(clientId);
    const ticket = await verifier.verifyIdToken({ idToken: exchange.id_token, audience: clientId });
    payload = ticket.getPayload() ?? {};
  } catch (err) {
    logger.error('[storeGoogleToken] id_token verification failed', { err });
    throw new HttpsError('invalid-argument', 'invalid_id_token');
  }

  const email = payload.email;
  if (!email) {
    throw new HttpsError('invalid-argument', 'id_token missing email claim');
  }

  // 3. Resolve (or create) the Firebase user for this email
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'auth/user-not-found') {
      const created = await auth.createUser({
        email,
        emailVerified: payload.email_verified ?? false,
        displayName: payload.name,
        photoURL: payload.picture,
      });
      uid = created.uid;
      logger.info('[storeGoogleToken] Created new Firebase user', { uid, email });
    } else {
      logger.error('[storeGoogleToken] getUserByEmail failed', { err });
      throw new HttpsError('internal', 'user_lookup_failed');
    }
  }

  // 4. Persist the real Google refresh token (server-only) and mint a custom token
  await saveUserToken(uid, exchange.refresh_token, exchange.scope ?? '');
  const customToken = await auth.createCustomToken(uid);

  logger.info('[storeGoogleToken] Token stored', { uid });
  return {
    customToken,
    accessToken: exchange.access_token,
    expiresIn: exchange.expires_in,
    scope: exchange.scope,
  };
}
