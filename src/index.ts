import { onRequest, onCall } from 'firebase-functions/v2/https';
import { logger, setGlobalOptions } from 'firebase-functions/v2';
import * as functions from 'firebase-functions/v1';
import { webhookHandler } from './webhook/handler';
import { onUserCreatedHandler } from './auth/onUserCreated';
import { syncClaimsHandler } from './admin/syncClaims';
import { replayWebhookHandler } from './admin/replayWebhook';
import { storeGoogleTokenHandler } from './token/store';
import { refreshGoogleTokenHandler } from './token/refresh';
import { revokeGoogleTokenHandler } from './token/revoke';
import { createDodoPortalSessionHandler } from './customer/portal';
import { dodoWebhookSecret, dodoApiKey, googleClientSecret, allowedOrigins } from './config';

function tokenCors(): true | string[] {
  const raw = allowedOrigins.value().trim();
  if (!raw) {
    logger.warn('[index] ALLOWED_ORIGINS is unset — token endpoints accept any origin');
    return true;
  }
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
  timeoutSeconds: 60,
  memory: '256MiB',
});

export const dodoWebhook = onRequest({ cors: false, secrets: [dodoWebhookSecret] }, webhookHandler);

// Auth trigger (v1 style) — fires when a new Firebase user is created
// This links pre-registration Dodo purchases to the new Firebase account
export const onUserCreated = functions.auth.user().onCreate(onUserCreatedHandler);

export const adminSyncClaims = onRequest({ cors: false, secrets: ['ADMIN_SECRET'] }, syncClaimsHandler);
export const adminReplayWebhook = onRequest({ cors: false, secrets: ['ADMIN_SECRET', dodoApiKey] }, replayWebhookHandler);

// Google OAuth token lifecycle — callable endpoints invoked by the website iframe and Chrome
// extension via the Firebase SDK. App Check is NOT enforced for now (reCAPTCHA v3 can't run in
// the Chrome extension); re-add `enforceAppCheck: true` once an extension-compatible provider is set up.
// The client_secret never leaves these functions. `storeGoogleToken` accepts a GIS auth code
// (no Firebase session required yet, hence no auth gate); `refresh`/`revoke` require an
// authenticated caller via `request.auth`.
export const storeGoogleToken = onCall({ cors: tokenCors(), secrets: [googleClientSecret] }, storeGoogleTokenHandler);
export const refreshGoogleToken = onCall({ cors: tokenCors(), secrets: [googleClientSecret] }, refreshGoogleTokenHandler);
export const revokeGoogleToken = onCall({ cors: tokenCors(), secrets: [] }, revokeGoogleTokenHandler);

// Dodo customer portal session — callable, authenticated via `request.auth`.
// Resolves the caller's Dodo customerId from Firestore and returns a time-bound portal link.
export const createDodoPortalSession = onCall({ cors: tokenCors(), secrets: [dodoApiKey] }, createDodoPortalSessionHandler);
