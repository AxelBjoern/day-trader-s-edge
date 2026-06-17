## Goal

Both demo and live IG logins return `error.security.invalid-details` (HTTP 401). The code is spec-correct, so the failure is on the IG side (wrong env key, expired demo, or username vs email). This plan adds the maximum useful help we can give from the app without changing the underlying credentials.

## Scope

Three small, independent changes in `src/lib/ig.server.ts` and `src/routes/_authenticated/dashboard.settings.tsx`. No DB, no new secrets, no UI redesign.

### 1. v3 OAuth fallback in `igLogin`

- Keep the current v2 call as the primary path.
- On HTTP 401 with `error.security.invalid-details` only, retry once against the same base URL with `Version: 3` and body `{ identifier, password }` (no `encryptedPassword`).
- v3 success returns `oauthToken.access_token`, `oauthToken.refresh_token`, and `accountId` in the body. Build the `IgSession` from those: store `access_token` as `xst` substitute is not valid — instead extend `IgSession` with optional `oauth: { accessToken, refreshToken, accountId, tokenType, expiresInSec }`.
- Update `authHeaders()` to prefer OAuth headers when `oauth` is set: `Authorization: Bearer <access_token>` and `IG-ACCOUNT-ID: <accountId>`; otherwise keep `CST` / `X-SECURITY-TOKEN`.
- Why: community reports on `ig-python/trading-ig#202` show v3 sometimes succeeds on demo when v2 returns `invalid-details`. Costs one extra request only on failure.

### 2. Lockout-aware error reporting

- Extend `parseIgErrorCode` consumers to distinguish `error.security.too-many-failed-attempts` (the real lockout code per IG docs) from `error.security.invalid-details`.
- In `nextStepForIgError`, add a branch for `too-many-failed-attempts` that says: "IG locked the account after repeated failed logins. Wait ~15 minutes before retrying."
- Keep the existing `invalid-details` message but append: "If you can sign in at the IG portal with these credentials, regenerate the API key for this environment."

### 3. Settings UI: portal links + tightened guard

- In the IG diagnostics panel (`dashboard.settings.tsx`), add two small outbound links below the Check buttons:
  - "Open IG demo portal" → `https://demo.ig.com/`
  - "Open IG live portal" → `https://www.ig.com/`
- Render a one-line hint when the latest result's `errorCode` is `error.security.invalid-details`: "Verify the username (not email) and password at the matching portal, then regenerate the API key there."
- Tighten the username validation regex in `igLogin` from `/^[A-Za-z0-9._-]+$/` to `/^[A-Za-z0-9_-]{1,30}$/` to match IG's published `identifier` pattern.

## Out of scope

- Storing or refreshing v3 access tokens between requests (we re-login per request today; v3 refresh-token rotation is unnecessary).
- Encrypted-password flow (`GET /session/encryptionKey` + RSA). IG only requires it for a tiny set of accounts and ours isn't one of them.
- Any change to secrets, env names, or the demo/live toggle.

## Files touched

- `src/lib/ig.server.ts` — `IgSession` type, `igLogin`, `authHeaders`, `nextStepForIgError`, username regex.
- `src/routes/_authenticated/dashboard.settings.tsx` — portal links + conditional hint in the diagnostics panel.

## Validation

- Click "Check both (demo + live)" with current (rejected) creds: expect the panel to still show 401 but now with portal links and the new hint, and — if v3 happens to succeed on either env — a green success card instead.
- No regression on a working environment: v2 succeeds on first try, v3 fallback never fires.
