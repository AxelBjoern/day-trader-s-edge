# IG Credentials Diagnostics Panel

Replace the current raw-JSON failure banner under "IG CONNECTION" with a structured diagnostics panel that surfaces actionable information when login is rejected.

## What it shows

On every "Check IG connection" result (success or failure):
- **Environment** — `demo` / `live` badge.
- **Sanitized identifier** — IG username masked to first 2 + last 2 chars (e.g. `ax****22`), plus character length. Never reveals the full username, password, or API key.
- **API key fingerprint** — last 4 chars only (e.g. `••••A1B2`), so the user can verify which key is loaded without exposing it.
- **Latency** — ms from the existing response.
- **Status** — OK / Failed with HTTP-style error code.

On failure additionally:
- **Error code** — parsed IG code (e.g. `error.security.invalid-details`, `error.security.client-token-invalid`, HTTP status).
- **Next step** — one clear human sentence tied to the code:
  - `invalid-details` → "Update IG_USERNAME and IG_PASSWORD — they don't match an active demo account."
  - `client-token-invalid` → "Update IG_API_KEY — the key isn't valid for this username."
  - `403` → "Enable API access on the IG account."
  - unknown → generic "Re-check all three IG secrets for the selected environment."
- **Action buttons** — "Update IG secrets" (opens secrets dialog), "Switch environment" link.

On success: equity, balance, currency, open positions (already returned).

## Technical changes

### `src/lib/ig.server.ts`
- Add `sanitizeIdentifier(u)` → `ax****22` (first 2 + last 2, `*` middle; `***` if ≤ 4 chars).
- Add `fingerprintKey(k)` → last 4 chars.
- Add `parseIgErrorCode(status, body)` → returns `{ code: string | null, httpStatus: number }` extracted from IG's `errorCode` JSON field (fallback to substring scan).
- Export a new `igDiagnostics(env)` helper that returns `{ env, identifier, identifier_len, api_key_fingerprint, has_password }` from secrets without performing login (used even when secrets are missing).

### `src/lib/trading.functions.ts`
- Extend `checkIgConnection` response shape:
  - Always include `identifier`, `identifier_len`, `api_key_fingerprint`, `password_set` (boolean), `env_credentials_present`.
  - On failure include `error_code` (parsed IG code or HTTP status string) and `next_step` (string).
- Implementation: call `igDiagnostics(env)` first; then attempt login. On thrown error parse the message for the IG code via the new helper.

### `src/routes/_authenticated/dashboard.settings.tsx`
- Replace the raw `JSON.stringify(r)` rendering for IG with a new `<IgDiagnostics result={...} />` panel:
  - Grid of labeled fields (identifier, API key, env, latency).
  - Colored status row (green/red).
  - On failure: error code chip + next-step paragraph + "Update IG secrets" button (uses existing settings flow / opens backend link).
- OpenRouter banner stays as-is (out of scope).

## Out of scope
- No changes to scan logic, OpenRouter panel, or secret storage.
- No new secrets or migrations.
