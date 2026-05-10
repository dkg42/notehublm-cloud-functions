# NoteHub LM — Cloud Functions

## Project Overview

Firebase Cloud Functions backend for **NoteHub LM**, an AI-powered note-taking app. This repo handles:
- Receiving and verifying **Dodo Payments** webhook events
- Syncing subscription state to **Firestore** and **Firebase Auth custom claims**
- Linking pre-registration Dodo purchases to newly-created Firebase accounts
- Admin endpoints for manual claims sync and subscription data refresh

Firebase project: `notehublm-a2490`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Language | TypeScript 5.4 (strict mode, NodeNext modules) |
| Framework | Firebase Functions v2 (HTTP), v1 (Auth trigger) |
| Database | Cloud Firestore |
| Auth | Firebase Authentication + custom claims |
| Payments | Dodo Payments SDK v2.29.0 |
| Webhook verification | `standardwebhooks` v1.0.0 |
| Build output | `lib/` (compiled from `src/`) |

---

## Repository Layout

```
src/
  index.ts              # Entry point — exports all 4 Cloud Functions
  types.ts              # All shared TypeScript interfaces (source of truth)
  config.ts             # Firebase param definitions + productIdToPlan()

  webhook/
    handler.ts          # Main webhook dispatcher (routes events, batches writes)
    verify.ts           # Webhook signature verification (Standard Webhooks)

  auth/
    onUserCreated.ts    # Auth trigger: links Dodo customer to new Firebase user

  admin/
    auth.ts             # checkAdminSecret() — timing-safe header validation
    syncClaims.ts       # adminSyncClaims handler: sync claims from Firestore → Auth
    replayWebhook.ts    # adminReplayWebhook handler: fetch fresh data from Dodo API

  firebase/
    admin.ts            # Singleton Firebase Admin init (exports db, auth, FieldValue)
    firestore.ts        # All Firestore read/write helpers (see Key Utilities below)
    claims.ts           # setSubscriptionClaims(), buildClaimsFromCustomerDoc()
    userLookup.ts       # resolveFirebaseUid() — finds UID from customer doc or Auth

  events/
    subscription.ts     # Maps Dodo subscription events → SubscriptionResult
    payment.ts          # Logs payment.succeeded, payment.failed, refund.succeeded

firebase.json           # Firebase config (functions, firestore, emulators)
firestore.rules         # Firestore security rules
firestore.indexes.json  # Field overrides (customers.firebaseUid ASCENDING)
.firebaserc             # Project alias: default → notehublm-a2490
```

---

## Cloud Functions

All functions use global options: region `us-central1`, max 10 instances, 60s timeout, 256 MiB memory.

### `dodoWebhook` — HTTP POST (v2)
- **Trigger**: POST from Dodo Payments to the function URL
- **Secrets**: `DODO_PAYMENTS_WEBHOOK_SECRET`
- **Flow**:
  1. Verify webhook signature via Standard Webhooks library
  2. Atomically claim webhook ID (idempotency — skip if already processed)
  3. Route event to subscription or payment handler
  4. Resolve Firebase UID for the customer
  5. Batch-write Firestore updates + mark webhook processed
  6. Set Firebase Auth custom claims (if UID found)
  7. Return `201 { received: true }`

### `onUserCreated` — Auth Trigger (v1)
- **Trigger**: `functions.auth.user().onCreate`
- **Secrets**: none (uses existing Firestore data)
- **Flow**:
  1. Query `customers` by new user's email
  2. If customer found and has an active subscription, link Firebase UID to customer doc
  3. Set subscription custom claims on the new user

### `adminSyncClaims` — HTTP POST (v2)
- **Trigger**: POST with `x-admin-secret` header
- **Secrets**: `ADMIN_SECRET`
- **Body**: `{ email?, uid?, customerId? }` — one of these three required
- **Flow**: Resolve customer doc → resolve Firebase UID → rebuild claims from Firestore → set on Auth user

### `adminReplayWebhook` — HTTP POST (v2)
- **Trigger**: POST with `x-admin-secret` header
- **Secrets**: `ADMIN_SECRET`, `DODO_PAYMENTS_API_KEY`
- **Body**: `{ customerId }` required
- **Flow**: Call Dodo API for latest subscription → upsert Firestore customer doc → set claims → mark synthetic webhook ID as processed

---

## Firestore Data Model

### `customers/{dodoCustomerId}`

```typescript
interface CustomerDoc {
  email: string;
  firebaseUid: string | null;          // null until Firebase account is created
  subscriptionStatus: 'active' | 'cancelled' | 'expired' | 'on_hold' | 'none';
  subscriptionPlan: 'pro_monthly' | 'pro_yearly' | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;     // ISO date string or null
  updatedAt: firestore.Timestamp;      // always server timestamp
  lastWebhookEvent: string;            // e.g. "subscription.active"
}
```

Document ID is the Dodo `customer_id`. Indexed field: `firebaseUid` (ASCENDING, for `queryCustomerByUid`).

### `webhook_events/{webhookId}`

```typescript
interface WebhookEventDoc {
  receivedAt?: firestore.Timestamp;    // set on atomic claim
  processedAt: firestore.Timestamp;   // set after processing
  eventType: string;
}
```

Used exclusively for idempotency. `tryClaimWebhookId()` uses `create()` — if the document already exists, the event is skipped. No client access.

---

## TypeScript Types (`src/types.ts`)

```typescript
type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'on_hold' | 'none';
type SubscriptionPlan   = 'pro_monthly' | 'pro_yearly';

interface SubscriptionClaims {        // stored in Firebase Auth custom claims
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionId: string | null;
  customerId: string | null;
  currentPeriodEnd: string | null;    // ISO datetime or null
}

interface SubscriptionResult {        // internal return type from event handlers
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
}

interface DodoWebhookPayload {
  business_id: string;
  type: string;
  timestamp: string;
  data: SubscriptionEventData | PaymentEventData | RefundEventData;
}
```

---

## Security Model

### Webhook Signature Verification (`src/webhook/verify.ts`)
- Library: `standardwebhooks` (`Webhook` class)
- Headers validated: `webhook-id`, `webhook-timestamp`, `webhook-signature`
- Secret: `DODO_PAYMENTS_WEBHOOK_SECRET` (Firebase Secret)
- Failure response: `401 Unauthorized`

### Admin Endpoint Authentication (`src/admin/auth.ts`)
- Header: `x-admin-secret`
- Validation: SHA-256 hash of header value compared against hash of `ADMIN_SECRET` using `crypto.timingSafeEqual()`
- Failure response: `401 Unauthorized`

### Firestore Security Rules (`firestore.rules`)
```
customers/{customerId}:
  get:   auth.uid must match resource.data.firebaseUid
  list:  auth.uid must match request.query filter on firebaseUid
  write: denied

webhook_events/{webhookId}: all denied
{document=**}: all denied (catch-all)
```

### Firebase Auth Custom Claims
Claims (`SubscriptionClaims`) are set server-side only. Clients read them from the ID token to gate features. Claims merge with existing claims via spread (`{ ...existing, ...newClaims }`).

---

## External Services

### Dodo Payments
- SDK: `dodopayments` v2.29.0
- Environment toggle: `DODO_ENV` (`test_mode` | `live_mode`)
- API calls made:
  - `client.subscriptions.retrieve(subscriptionId)` — used by adminReplayWebhook
  - `client.subscriptions.list({ customer_id })` — used by adminReplayWebhook fallback

**Subscription webhook events handled:**
- `subscription.active` → status: `active`
- `subscription.renewed` → status: `active`
- `subscription.plan_changed` → status: `active`
- `subscription.cancelled` → status: `cancelled`
- `subscription.expired` → status: `expired`
- `subscription.on_hold` → status: `on_hold`
- `subscription.failed` → status: `on_hold`

**Payment events (logged only, no Firestore write):**
- `payment.succeeded`, `payment.failed`, `refund.succeeded`

### Firebase Services Used
- **Firestore**: customer data and webhook idempotency
- **Authentication**: user creation trigger + custom claims
- **Cloud Functions**: runtime (no Storage, no Hosting, no Realtime DB)

---

## Environment Variables

| Variable | Kind | Required | Purpose |
|---|---|---|---|
| `DODO_PAYMENTS_WEBHOOK_SECRET` | Secret | Yes | Webhook signature verification |
| `DODO_PAYMENTS_API_KEY` | Secret | Yes (adminReplayWebhook) | Dodo REST API calls |
| `ADMIN_SECRET` | Secret | Yes (admin endpoints) | Admin endpoint authentication |
| `DODO_PRODUCT_ID_PRO_MONTHLY` | String param | Yes | Maps Dodo product ID → `pro_monthly` plan |
| `DODO_PRODUCT_ID_PRO_YEARLY` | String param | Yes | Maps Dodo product ID → `pro_yearly` plan |
| `DODO_ENV` | String param | No (default: `test_mode`) | `test_mode` or `live_mode` |

Secrets are defined with `defineSecret()` (Firebase Functions params) and injected at runtime. String params use `defineString()`. Local values go in `.env.local`; production values in `.env` or Firebase Secret Manager.

---

## Build & Deployment

```bash
npm run build          # tsc → compiles src/ to lib/
npm run build:watch    # watch mode
npm run typecheck      # type check without emitting
npm run lint           # eslint src/
npm run serve          # build + start emulators (functions, firestore, auth)
npm run deploy         # firebase deploy --only functions
```

**Firebase emulator ports:**
- Functions: 5001
- Firestore: 8080
- Auth: 9099
- Emulator UI: 4000

**Deploy predeploy hooks** (defined in `firebase.json`): runs lint then build before any `firebase deploy`.

---

## Key Utilities — Prefer These, Don't Rewrite

All live in `src/firebase/`:

### `firestore.ts`
```typescript
tryClaimWebhookId(webhookId)             // atomic create; returns false if duplicate
getCustomerDoc(customerId)               // fetch by Dodo customer ID
queryCustomerByEmail(email)              // returns { id, data } or null
queryCustomerByUid(firebaseUid)          // returns { id, data } or null
addUpsertCustomerDoc(batch, id, fields)  // batch set with merge:true + serverTimestamp
addLinkUidToCustomer(batch, id, uid)     // batch update firebaseUid
addMarkWebhookProcessed(batch, id, type) // batch set on webhook_events doc
```

### `claims.ts`
```typescript
setSubscriptionClaims(uid, claims)            // merges + sets custom claims
buildClaimsFromCustomerDoc(customerId, data)  // constructs SubscriptionClaims from CustomerDoc
```

### `userLookup.ts`
```typescript
resolveFirebaseUid(customerId, email)   // tries: doc.firebaseUid → auth.getUserByEmail()
```

### `admin.ts`
```typescript
db      // Firestore instance
auth    // Firebase Auth instance
FieldValue  // for serverTimestamp()
```

### `config.ts`
```typescript
productIdToPlan(productId)  // maps Dodo product ID string → SubscriptionPlan | null
```
