# Fix: connection checks and AI routing

## Findings

1. **IG connection**
   - The app is reaching IG successfully; the failing response is from IG itself.
   - Recent backend log: `IG login failed (401): {"errorCode":"error.security.invalid-details"}`.
   - That means the configured demo username, password, API key, or selected environment do not match an active IG demo account.

2. **AI router**
   - The scan code still used the old Hermes naming/model path.
   - OpenRouter currently exposes DeepSeek V4 Pro as `deepseek/deepseek-v4-pro`.

## Fix implemented

1. **IG diagnostics**
   - Keep using the configured demo/live IG secrets.
   - Return a clear safe error when IG replies with `error.security.invalid-details` instead of showing only the raw broker payload.
   - Preserve the Settings page **Check IG connection** action.

2. **OpenRouter / DeepSeek**
   - Default AI model is now `deepseek/deepseek-v4-pro`.
   - Optional override: `OPENROUTER_MODEL` can be set later without code changes.
   - Scan and validation logs now report `OpenRouter` and the exact model used.
   - Settings now includes **Check AI router** to verify the OpenRouter key/model independently.

3. **Copy updates**
   - Public copy now says DeepSeek V4 Pro instead of Hermes 4 405B.

## Remaining action

- If IG still fails after this code change, update the IG demo secrets so `IG_USERNAME`, `IG_PASSWORD`, and `IG_API_KEY` all belong to the same active IG demo account. The current failure is not a route/build issue; it is broker credential rejection.
