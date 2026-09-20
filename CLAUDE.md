# NoteHub LM — Cloud Functions

Firebase Cloud Functions backend for **NoteHub LM**: Dodo Payments webhooks,
subscription state in Firestore + Auth custom claims, and Google OAuth token
brokerage for the web app and Chrome extension.

[README.md](README.md) is the full reference — architecture, every function,
data model, configuration, deployment. Read it before making non-trivial
changes. This file covers only what an agent needs on top of that.

Firebase projects: `notehublm-a2490` (dev/staging), `notehublm-prod` (prod).

---

## Fast orientation

| Question | File |
|---|---|
| What functions exist, and with which secrets/CORS? | `src/index.ts` |
| What shape is a document or payload? | `src/types.ts` |
| Where does a config value come from? | `src/config.ts` |
| How is a subscription event mapped to a status? | `src/events/subscription.ts` |
| How does a webhook get processed end to end? | `src/webhook/handler.ts` |

Stack: Node 22, TypeScript 5.4 strict / NodeNext, Firebase Functions v2 (HTTP +
callable) plus v1 for the Auth trigger, Firestore, Dodo Payments SDK v2.29,
`standardwebhooks` v1, `google-auth-library` v10. Build `src/` → `lib/`.

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint src/  (flat config, eslint.config.js)
npm run build       # tsc
npm run serve       # build + emulators (functions 5001, firestore 8080, auth 9099, ui 4000)
```

Run `typecheck` and `lint` before declaring a change done — the Firebase
predeploy hooks run lint and build, so a failure there blocks deploys.

---

## Prefer these helpers — don't rewrite them

**`src/firebase/firestore.ts`** — all Firestore access goes through here.

```typescript
tryClaimWebhookId(webhookId)             // atomic create(); false if already claimed
releaseWebhookClaim(webhookId)           // undo a claim so Dodo's retry can reprocess
getCustomerDoc(customerId)
queryCustomerByEmail(email)              // → { id, data } | null
queryCustomerByUid(firebaseUid)          // → { id, data } | null
addUpsertCustomerDoc(batch, id, fields)  // batch set, merge:true + serverTimestamp
addLinkUidToCustomer(batch, id, uid)     // batch update firebaseUid
getUserToken(uid) / saveUserToken(uid, refreshToken, scope) / deleteUserToken(uid)
```

**`src/firebase/claims.ts`**

```typescript
setSubscriptionClaims(uid, claims)            // merges over existing claims
buildClaimsFromCustomerDoc(customerId, data)  // CustomerDoc-ish → SubscriptionClaims
```

**`src/firebase/userLookup.ts`**

```typescript
resolveCustomerAndUid(customerId, email)  // → { uid, customerDoc }; customer doc, then auth.getUserByEmail
```

**`src/firebase/admin.ts`** — `db`, `auth`, `FieldValue` (singleton init).

**`src/config.ts`** — `productIdToPlan(productId)`, plus every secret/param
definition. Add new config here, never `process.env` inline. (The one exception
is `ADMIN_SECRET`, read via `process.env` in `src/admin/auth.ts`.)

---

## Invariants — do not break these

- **Firestore is the source of truth; Auth claims are a derived cache.** Any new
  write path must keep both consistent and must be rebuildable by
  `adminSyncClaims`.
- **Verify webhooks against `req.rawBody`.** A parsed-and-reserialized body has
  different bytes and will fail the HMAC.
- **Every webhook is claimed before processing and released if the batch commit
  fails.** Dropping the release silently swallows events; dropping the claim
  double-processes billing.
- **Never return a refresh token, client secret, or API key in a response.**
- **Never put a secret in `.env` or `.env.<projectId>`** — those are committed.
  Secrets go to Secret Manager; `.env.local` is gitignored and emulator-only.
- **`onUserCreated` links by email and must keep requiring a verified email**,
  or an unverified signup can inherit someone else's subscription.
- **Log identifiers, never tokens or raw payloads.** Structured logging with a
  `[module]` prefix.

## Gotchas

- `DODO_ENV` defaults to `test_mode` in `config.ts` — a deliberate fail-safe.
  Never change the default.
- `ALLOWED_ORIGINS` fails **closed**: empty means `tokenCors()` returns `[]` and
  every cross-origin callable request is rejected (logged at error level). Both
  committed project env files set it; a new project must too, or its clients break.
- App Check is intentionally not enforced — reCAPTCHA v3 can't run in the Chrome
  extension. Don't add `enforceAppCheck: true` without an extension-compatible
  provider.
- `storeGoogleToken` is unauthenticated by design: it mints the Firebase session,
  so no session exists yet. The auth code is the credential.
- Deploy with an explicit `--project`; the `default` alias is the dev project.
- `.agents/` and `.claude/` are gitignored local scaffolding, not part of the backend.
