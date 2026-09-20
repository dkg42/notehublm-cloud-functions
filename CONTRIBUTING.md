# Contributing

This is the backend for a specific product, not a general-purpose library, and
[LICENSE](LICENSE) grants no reuse rights. Bug reports and focused pull requests
are still welcome — please open an issue before starting anything substantial so
we can agree it fits the product's direction.

**Security issues do not go in the issue tracker.** Follow
[SECURITY.md](SECURITY.md) instead.

By submitting a contribution you agree that it may be incorporated into this
repository under the terms of [LICENSE](LICENSE).

## Setup

```bash
npm install
cp .env.example .env.local     # fill in real values; .env.local is gitignored
npm run serve                  # functions, Firestore, and Auth emulators
```

Running the full flow end to end needs a Dodo Payments test account and a Google
OAuth client. Most changes can be exercised against the emulators alone.

## Before you open a PR

```bash
npm run typecheck
npm run lint
npm run build
```

All three must pass. The Firebase predeploy hooks run lint and build anyway, so a
failure here is a failure at deploy time.

## Branching

`main` is the mainline. Release work happens on `release/**` branches; a GitHub
Actions workflow opens a back-merge PR from any `release/**` branch into `main`
and auto-merges it when there is no conflict, so release fixes are never
stranded. Target `main` unless you are fixing a live release.

## Code conventions

The codebase is small and consistent — match what is already there rather than
introducing a new style.

- **TypeScript strict mode.** No `any` (lint warns), no non-null assertions
  unless the invariant is obvious and commented.
- **Types live in `src/types.ts`.** It is the single source of truth for
  Firestore document and webhook payload shapes. Add to it rather than declaring
  shapes inline.
- **Reuse the helpers in `src/firebase/`.** Firestore access goes through
  `firestore.ts`, claims through `claims.ts`, UID resolution through
  `userLookup.ts`. Do not reach for `db` directly when a helper exists.
- **Comments explain *why*, not *what*.** The existing comments document
  non-obvious decisions — why `storeGoogleToken` is unauthenticated, why the
  webhook claim is released on failure. Keep that bar.
- **Log identifiers, never secrets.** Structured logging with a `[module]`
  prefix. Never log tokens, secrets, or raw webhook bodies.

## Things to be careful about

These are the parts where a plausible-looking change causes real damage.

- **Never weaken webhook verification or the idempotency claim.** Duplicate
  processing corrupts billing state; a released claim that should not have been
  released loses an event entirely.
- **Treat Firestore as the source of truth and claims as a cache.** A new write
  path must keep the two consistent, and must be replayable via `adminSyncClaims`.
- **Never return a refresh token, client secret, or API key to a caller.** Check
  every new response shape against this.
- **Never put a secret in a committed `.env.<projectId>` file.** Those files are
  tracked. Use Secret Manager.
- **Email-based account linking requires a verified email.** Do not relax the
  check in `onUserCreated`.
- **Deploy with an explicit `--project`.** The `default` alias points at the
  development project.
