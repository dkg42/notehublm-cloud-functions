import './loadLocalEnv';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as functions from 'firebase-functions/v1';
import { webhookHandler } from './webhook/handler';
import { onUserCreatedHandler } from './auth/onUserCreated';
import { syncClaimsHandler } from './admin/syncClaims';
import { replayWebhookHandler } from './admin/replayWebhook';

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
  timeoutSeconds: 60,
  memory: '256MiB',
});

export const dodoWebhook = onRequest({ cors: false }, webhookHandler);

// Auth trigger (v1 style) — fires when a new Firebase user is created
// This links pre-registration Dodo purchases to the new Firebase account
export const onUserCreated = functions.auth.user().onCreate(onUserCreatedHandler);

export const adminSyncClaims = onRequest({ cors: false, secrets: ['ADMIN_SECRET'] }, syncClaimsHandler);
export const adminReplayWebhook = onRequest({ cors: false, secrets: ['ADMIN_SECRET', 'DODO_PAYMENTS_API_KEY'] }, replayWebhookHandler);
