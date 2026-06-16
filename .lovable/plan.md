## IG CFD Day Trader — Full App

Builds a TanStack Start app on Lovable Cloud that scans Nasdaq / FX / BTC every 5 min during the EST session, generates signals via Hermes (OpenRouter), risk-sizes them, auto-executes through the IG API, and force-closes everything at 16:55 EST.

### Secrets needed
- `IG_API_KEY`, `IG_USERNAME`, `IG_PASSWORD` (demo)
- `IG_LIVE_API_KEY`, `IG_LIVE_USERNAME`, `IG_LIVE_PASSWORD` (live)
- `OPENROUTER_API_KEY`
- `CRON_SECRET` (shared secret for pg_cron → webhook auth)

You'll be prompted for these after Cloud is enabled.

### Backend (Lovable Cloud + TanStack server routes)

Database tables:
- `app_settings` — singleton: environment (`demo`|`live`), min_confidence, max_risk_per_trade_pct (0.02), max_daily_loss_pct (0.05), auto_execute (bool), session_start/end EST.
- `instruments` — epic, name, type, min_stop_distance_points, tick_value_per_point. Seeded with the 4 from your spec.
- `signals` — generated signal + LLM justification + status (pending/skipped/executed/rejected).
- `orders` — built order, sizing math, IG `dealReference`, status, fill price.
- `daily_pnl` — date, realized P&L, equity snapshots, loss-cap-hit flag.
- `trade_log` — full audit trail of every scan/exec/close.

All tables RLS-protected; only authenticated admin role can read/write.

Server routes (under `src/routes/api/public/` so pg_cron can hit them; each verifies `CRON_SECRET`):
- `POST /api/public/scan` — runs the 5-min cycle: IG login → fetch realized PnL → session check → quotes + 30×1m candles → Hermes signal scan → Hermes validation pass → risk sizing → if auto_execute and confidence ≥ min, place market order with stop/limit → log everything.
- `POST /api/public/eod-close` — IG login → list open positions → close each with opposite-direction market order → write daily summary.
- `POST /api/public/manual-scan` and `POST /api/public/manual-close` — same logic, gated by authenticated session instead of CRON_SECRET, for dashboard buttons.

Server-fn helpers (`src/lib/ig.server.ts`, `src/lib/openrouter.server.ts`, `src/lib/risk.server.ts`) encapsulate IG REST calls (session, /markets, /prices, /positions/otc, /history/transactions), Hermes calls (`nousresearch/hermes-4-405b` via OpenRouter chat completions with JSON-mode), and the position-sizing / daily-loss-cap math from your spec.

pg_cron jobs:
- `*/5 * * * *` → `net.http_post` to `/api/public/scan` with `Authorization: Bearer ${CRON_SECRET}`.
- `55 16 * * 1-5` (stored as UTC equivalent, DST-aware note in README) → `/api/public/eod-close`.

### Frontend (dashboard)

- `/auth` — email/password login (Cloud auth).
- `/` — overview: today's realized P&L, equity, open positions count, daily-loss-cap progress bar, last scan time, next scheduled scan, big red "Close all now" + "Scan now" buttons.
- `/signals` — table of recent signals with confidence, LLM justification, status, link to order.
- `/orders` — executed orders, fill, stop/target, current P&L (live IG fetch).
- `/settings` — environment toggle (demo/live), risk params, min confidence, auto_execute switch, session window, per-instrument overrides.
- `/logs` — paginated trade_log viewer.

Dark, terminal-style trading aesthetic (mono headings, green/red P&L, compact tables).

### Risk & safety rules baked in
- Hard stop: if `|realized_pnl_today| ≥ equity × max_daily_loss_pct`, no new orders for the rest of the day (route returns early, logs reason).
- Per-trade: `size = (equity × risk_pct) / (stop_distance × tick_value)`; skip if stop < `min_stop_distance_points` or if potential loss would breach remaining daily risk budget.
- Only orders with `confidence ≥ min_confidence` and that survived Hermes validation pass are executed.
- Live environment requires an extra confirm toggle in Settings before it can be enabled.

### What this app will NOT do
- No backtesting UI, no chart rendering of candles (data goes to LLM, not a chart) — can be added later.
- No streaming IG Lightstreamer feed; uses REST snapshots on each 5-min tick.
- No per-user multi-tenant — single trading account per deployment.

### Open items before build
1. Confirm OpenRouter + Hermes 4 405B is the intended model id (`nousresearch/hermes-4-405b`) — or specify a different Hermes variant.
2. EST session times: spec says 09:30–16:00; this matches NYSE hours. BTC trades 24/7 — should BTC be scanned outside that window? Default in plan: respect the single session window for all instruments unless you say otherwise.
