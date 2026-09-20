# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it through
[GitHub private vulnerability reporting](https://github.com/dkg42/notehublm-cloud-functions/security/advisories/new),
or by email to the repository owner. Include:

- what the issue is and which file or endpoint it affects,
- the steps or request sequence that demonstrate it,
- what an attacker gains.

Expect an acknowledgement within a few days. Please give a reasonable window for
a fix before disclosing publicly.

**In scope:** anything in `src/`, `firestore.rules`, and the deployment
configuration in this repository.

**Out of scope:** vulnerabilities in Firebase, Google OAuth, or Dodo Payments
themselves — report those to the respective vendor. Findings from automated
scanners with no demonstrated impact are also out of scope.

---

## Security model

### Trust boundaries

This service is the only tier permitted to write billing state or hold OAuth
refresh tokens. Clients are untrusted; Firestore is write-denied to them entirely.

| Surface | Who may call it | How it is authenticated |
|---|---|---|
| `dodoWebhook` | Dodo Payments | Standard Webhooks HMAC signature over the raw body |
| `storeGoogleToken` | anyone | Unauthenticated by design — the Google authorization code is the credential |
| `refreshGoogleToken`, `revokeGoogleToken`, `createDodoPortalSession` | signed-in users | Firebase `request.auth`, plus a fail-closed CORS origin allowlist (`ALLOWED_ORIGINS`) |
| `adminSyncClaims`, `adminReplayWebhook` | operators | `x-admin-secret` shared secret |
| `onUserCreated` | Firebase Auth | Internal trigger; not externally reachable |

### Webhook verification

Signatures are verified with the `standardwebhooks` library against
`DODO_PAYMENTS_WEBHOOK_SECRET`, over `req.rawBody` rather than a re-serialized
parsed body — reserialization would change the bytes and invalidate the HMAC.
The `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers must all
be present and valid. Verification happens **before** any parsing or Firestore
access; failures return `401` and are logged without the payload.

### Idempotency

Each `webhook-id` is claimed with a Firestore `create()`, which fails atomically
if the document already exists. A replayed or duplicated delivery therefore loses
the race and is skipped. If the subsequent batch write fails, the claim is
explicitly released so that Dodo's retry is processed rather than being
mistaken for a duplicate.

### Admin endpoint authentication

The provided `x-admin-secret` header and the configured `ADMIN_SECRET` are each
SHA-256 hashed, then compared with `crypto.timingSafeEqual()`. Hashing first
serves two purposes: it guarantees the equal-length buffers `timingSafeEqual`
requires, and it keeps the comparison from leaking the secret's length. A missing
`ADMIN_SECRET` fails closed with a `500`, never an open door.

These endpoints are unauthenticated HTTP functions guarded only by a shared
secret. Treat `ADMIN_SECRET` as a high-value credential: use a long random value,
rotate it on any suspicion, and prefer restricting invoker IAM on these functions
over relying on the header alone.

### Google OAuth token handling

- The client secret is a Secret Manager secret, referenced only inside
  `storeGoogleToken` and `refreshGoogleToken`. It is never returned in a response.
- `id_token` is verified through `google-auth-library` with its audience pinned
  to `GOOGLE_CLIENT_ID`, so a token minted for a different OAuth client is
  rejected before any user is created.
- Refresh tokens live in `user_tokens/{uid}`, which security rules deny to all
  clients. Only short-lived access tokens are returned over the wire.
- Rotation is honoured: if Google returns a new refresh token, it replaces the
  stored one.
- On `invalid_grant` — a revoked or expired grant — the stored record is deleted
  rather than retried.

`storeGoogleToken` accepting unauthenticated calls is deliberate: it is the
function that establishes the Firebase session, so no session can exist when it
runs. Its security rests on the authorization code being single-use, bound to
the OAuth client, and redeemable only with the client secret.

App Check is **not** currently enforced on the callable endpoints, because
reCAPTCHA v3 cannot run inside the Chrome extension. This is a known gap; it
should be re-enabled once an extension-compatible attestation provider is
configured.

### Account linking

`onUserCreated` links a pre-existing Dodo purchase to a new Firebase account by
email. It refuses to link unless the email is verified — either `emailVerified`
is true, or sign-in used a provider that guarantees verification (`google.com`).
Without this check, registering an unverified address that matches someone else's
purchase would inherit their subscription.

### Firestore rules

`firestore.rules` is deny-by-default, terminated by a catch-all
`match /{document=**} { allow read, write: if false; }`.

| Collection | Client access |
|---|---|
| `customers/{customerId}` | `get` and `list` only where `resource.data.firebaseUid == request.auth.uid`; all writes denied |
| `user_tokens/{uid}` | fully denied |
| `webhook_events/{webhookId}` | fully denied |

The `list` rule works because Firestore requires a client query to be provably
satisfiable by the rule, forcing a `where('firebaseUid', '==', uid)` filter.

### Secret management

No secret is ever committed. The committed `.env.<projectId>` files hold
non-secret configuration only: Dodo product IDs, the public OAuth client ID, the
Dodo mode, and CORS origin allowlists. `.gitignore` ignores all `.env*` files by
default and re-allows only those known-safe files, so a newly created env file
cannot be committed by accident.

Runtime secrets are stored in Google Secret Manager and injected per function:

```bash
firebase functions:secrets:set <NAME> --project <project-id>
```

`.env.local` is the only place a real secret may sit on disk, is gitignored, and
is never deployed.

### Logging

Logs deliberately record identifiers — UIDs, customer IDs, emails, webhook IDs,
event types — and never tokens, secrets, or raw webhook bodies. Email addresses
in Cloud Logging are personal data; treat log access accordingly.
