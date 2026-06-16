# Trading Ops Enhancements

Four additions on top of the existing IG CFD app. Each is scoped to keep blast radius small and reuse current tables (`daily_pnl`, `orders`, `trade_log`, `app_settings`).

## 1. Performance charts + CSV export

**New route:** `/dashboard/performance`
- **Realized P&L chart** — line chart of `daily_pnl.daily_realized_pnl` over time, with a cumulative-equity line overlay. Date-range presets (7d / 30d / 90d / All) + custom range picker.
- **Orders chart** — stacked bars per day of orders by `status` (filled / closed / rejected), plus a win-rate line (closed orders with `realized_pnl > 0` / total closed).
- **Per-instrument breakdown** — small table: instrument, trades, win rate, total realized P&L.
- **CSV export buttons** — "Export daily P&L" and "Export orders" produce CSVs respecting the active date range. Implemented as authenticated `createServerFn` returning CSV text; client triggers a Blob download.
- Charts use Recharts (already in shadcn stack) with the existing terminal theme tokens (bull/bear colors).

## 2. Loss-cap notifications

When `scan.server.ts` detects daily realized loss ≥ `daily_loss_cap_pct` and pauses `auto_execute` for the day:
- **New table** `notification_settings` (singleton, admin-only): `email_enabled`, `email_to`, `webhook_enabled`, `webhook_url`, `notify_on_loss_cap`, `notify_on_eod`, `notify_on_errors`.
- **New helper** `src/lib/notify.server.ts` — `sendLossCapAlert({ date, equity, dailyPnl, capPct })`:
  - Email path uses the Lovable Cloud email infrastructure (will run the email-domain setup tool on first build).
  - Webhook path posts JSON `{ type: "loss_cap_triggered", date, equity, daily_pnl, cap_pct, ts }` with HMAC `x-vdnx-signature` using `CRON_SECRET`.
- **Idempotency** — add `loss_cap_notified_date` to `app_settings`; only send once per UTC date.
- Settings page gets a "Notifications" card to configure recipients and toggle channels, plus a "Send test alert" button.

## 3. DST-aware EOD scheduling (16:55 America/New_York)

Problem: current cron `55 16 * * 1-5` is UTC, so it drifts between EST/EDT.

Fix: run the cron **every minute on weekdays during the candidate window** and let the handler decide.
- New cron `vdnx-eod-close-gate`: `50-59 20-21 * * 1-5` (covers 16:50–17:59 ET across both DST states).
- `/api/public/eod-close` checks `new Date().toLocaleString("en-US", { timeZone: "America/New_York", ... })` — only runs if NY time is exactly `16:55` (minute granularity) **and** today's EOD hasn't run yet (idempotency via `daily_pnl.eod_closed_at` timestamp column, new).
- Old fixed UTC cron is dropped in the same migration.

## 4. Cron status & last-run dashboard

- **New table** `job_runs`: `job_name` (`scan` | `eod_close`), `started_at`, `finished_at`, `status` (`success` | `error` | `skipped`), `summary` (jsonb: counts, errors, dry_run flag), `duration_ms`.
- Both public endpoints write a row on every invocation (skipped runs included — e.g. outside session, dedup-skipped EOD).
- **New dashboard card** "Cron status" on `/dashboard`:
  - Per job: last run time (relative), status badge, next expected run, mini sparkline of last 20 runs (green/red dots).
  - Alert banner if last scan > 15 min ago during a trading session, or last EOD missed.
- **New route** `/dashboard/jobs` — paginated full history table with summary JSON expand, filter by job/status.

## 5. Dry-run mode

- New column `app_settings.dry_run boolean default false` + Settings toggle ("Paper mode — simulate, don't place orders").
- `scan.server.ts` — when `dry_run` is on:
  - Runs login, market data, AI signal, validation, risk sizing **unchanged**.
  - **Skips** the IG `createPosition` call.
  - Writes `signals` row as usual; writes `orders` row with `status = 'dry_run'` and full sizing payload (`would_be_size`, `would_be_entry`, `would_be_sl`, `would_be_tp`).
  - `trade_log` entry tagged `dry_run = true`.
- Dashboard stats clearly badge "DRY RUN" when on; CSV export and charts include a column/legend split so paper trades don't pollute live performance numbers.
- Manual "Scan now" button gets a "Dry run this scan" variant that overrides per-call regardless of the setting.

---

## Technical details

**Migrations (one file):**
- `notification_settings` (singleton enforced by `id = 1` check), RLS admin-only, GRANTs.
- `job_runs` table, RLS admin read + service_role write, GRANTs, index on `(job_name, started_at desc)`.
- `app_settings`: add `dry_run`, `loss_cap_notified_date`, `notification_settings_id`.
- `daily_pnl`: add `eod_closed_at timestamptz`.
- `orders.status` check constraint relaxed → trigger to allow `'dry_run'`.
- Drop old cron `vdnx-eod-close`, schedule new gate cron.

**Server code (new files):**
- `src/lib/notify.server.ts` — email + webhook senders, HMAC signing.
- `src/lib/csv.server.ts` — small CSV serializer (no dep).
- `src/lib/jobs.server.ts` — `recordJobRun({ jobName, fn })` wrapper used by both public endpoints.
- `src/lib/performance.functions.ts` — `getDailyPnlSeries`, `getOrdersSeries`, `getInstrumentBreakdown`, `exportDailyPnlCsv`, `exportOrdersCsv` (all `requireSupabaseAuth` + admin check).
- `src/lib/jobs.functions.ts` — `getRecentJobRuns`, `getLastRunByJob`.

**Server code (edits):**
- `src/lib/scan.server.ts` — branch on `dry_run`, idempotent loss-cap notify, write `job_runs` via `recordJobRun`.
- `src/routes/api/public/scan.ts` & `eod-close.ts` — wrap handler in `recordJobRun`, EOD does NY-time gate + dedup.

**Frontend (new/edited):**
- `src/routes/_authenticated/dashboard.performance.tsx` (new, with Recharts).
- `src/routes/_authenticated/dashboard.jobs.tsx` (new).
- `src/routes/_authenticated/dashboard.tsx` — add Cron Status card + dry-run badge.
- `src/routes/_authenticated/dashboard.settings.tsx` — add Notifications card, Dry-run toggle.

**Email infra:** will run the Lovable email domain setup tool if no domain is configured yet — user will be prompted to pick a sender domain on first build.

**No changes to:** IG client, OpenRouter client, risk sizing math, auth, RBAC.
