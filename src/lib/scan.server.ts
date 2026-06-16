// Core scan + execute orchestration. Server-only.
import {
  igLogin,
  igGetMarket,
  igGetPrices,
  igGetTransactions,
  igCreatePosition,
  ymdInEst,
  isWithinSession,
  type IgEnv,
  type IgSession,
} from "./ig.server";
import { callHermes, parseJsonLoose } from "./openrouter.server";
import { buildOrders, type Instrument, type RawSignal } from "./risk.server";

export interface ScanOptions {
  manual?: boolean;
  forceIgnoreSession?: boolean;
}

export interface ScanResult {
  ok: boolean;
  skipped_reason?: string;
  environment: IgEnv;
  equity: number;
  realized_pnl: number;
  daily_loss_limit_hit?: boolean;
  signals_generated: number;
  signals_validated: number;
  orders_built: number;
  orders_executed: number;
  details?: any;
}

export async function runScan(opts: ScanOptions = {}): Promise<ScanResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settings, error: settingsErr } = await supabaseAdmin
    .from("app_settings").select("*").eq("id", 1).single();
  if (settingsErr || !settings) throw new Error("app_settings missing");

  const env = (settings.environment as IgEnv) ?? "demo";
  if (env === "live" && !settings.live_confirmed) {
    return baseResult(env, "live not confirmed");
  }

  const { data: instrumentsData } = await supabaseAdmin
    .from("instruments").select("*").eq("enabled", true);
  const instruments: Instrument[] = (instrumentsData ?? []).map((i: any) => ({
    epic: i.epic, name: i.name, type: i.type,
    min_stop_distance_points: Number(i.min_stop_distance_points),
    tick_value_per_point: Number(i.tick_value_per_point),
  }));

  if (instruments.length === 0) return baseResult(env, "no instruments enabled");

  // Session check
  const withinSession = isWithinSession(settings.session_start_est, settings.session_end_est);
  if (!withinSession && !opts.forceIgnoreSession) {
    return baseResult(env, "outside session");
  }

  // IG login
  let session: IgSession;
  try {
    session = await igLogin(env);
  } catch (e: any) {
    await log("error", `IG login failed: ${e.message}`, { env });
    throw e;
  }

  // Realized P&L today
  const today = ymdInEst();
  const tx = await igGetTransactions(session, `${today}T00:00:00`, `${today}T23:59:59`);
  let realized = 0;
  for (const t of tx.transactions ?? []) {
    if (t.transactionType === "DEAL" && (t.status === "ACCEPTED" || !t.status)) {
      const v = parseFloat(String(t.profitAndLoss ?? "0").replace(/[^0-9.\-]/g, ""));
      if (!isNaN(v)) realized += v;
    }
  }

  // Upsert open equity snapshot for today
  await supabaseAdmin.from("daily_pnl").upsert({
    date: today,
    equity_open: session.accountEquity,
    realized_pnl: realized,
  }, { onConflict: "date" });

  // Quotes + candles
  const quotes: any[] = [];
  const candles: Record<string, any[]> = {};
  for (const inst of instruments) {
    const m = await igGetMarket(session, inst.epic);
    if (m?.snapshot) {
      quotes.push({
        epic: inst.epic, name: inst.name,
        bid: m.snapshot.bid, ask: m.snapshot.offer,
        high: m.snapshot.high, low: m.snapshot.low,
        marketStatus: m.snapshot.marketStatus,
      });
    }
    const p = await igGetPrices(session, inst.epic, 30);
    if (p?.prices) {
      candles[inst.epic] = p.prices.map((c: any) => ({
        t: c.snapshotTimeUTC,
        o: c.openPrice?.bid, h: c.highPrice?.bid, l: c.lowPrice?.bid, c: c.closePrice?.bid,
        v: c.lastTradedVolume,
      }));
    }
  }

  // Hermes scan
  const scanPrompt = [
    {
      role: "system" as const,
      content:
        "You are a quantitative day-trader. Given current quotes (bid/ask) and last 30 1-minute candles for multiple CFD instruments, detect potential trade setups: breakouts above recent resistance, VWAP reclaims, volume spikes vs recent average, reversals at key levels. Respect each instrument's min_stop_distance_points so stops are valid for the broker. Output ONLY a JSON object {\"signals\": [...]} with up to 3 signals. Each signal: {epic, name, direction (BUY/SELL), entry_price, stop_loss, take_profit, confidence (0-1)}. If no credible setup, return {\"signals\": []}.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({ quotes, candles, instruments }, null, 2),
    },
  ];
  let rawSignals: RawSignal[] = [];
  try {
    const out = await callHermes(scanPrompt, { json: true });
    const parsed = parseJsonLoose<{ signals: RawSignal[] }>(out);
    rawSignals = (parsed?.signals ?? []).filter(Boolean);
  } catch (e: any) {
    await log("error", `Hermes scan failed: ${e.message}`);
  }

  // Hermes validation pass
  let validated: RawSignal[] = [];
  if (rawSignals.length > 0) {
    const validatePrompt = [
      {
        role: "system" as const,
        content:
          "You are a senior macro trader. Validate each trade signal in plain JSON. Adjust confidence and stop/target only if clearly justified by the candle context. Append a 'justification' string to each signal explaining the thesis. Output ONLY {\"signals\": [...]}. Reject signals you can't justify.",
      },
      {
        role: "user" as const,
        content: JSON.stringify({ signals: rawSignals, candles }, null, 2),
      },
    ];
    try {
      const out = await callHermes(validatePrompt, { json: true });
      const parsed = parseJsonLoose<{ signals: RawSignal[] }>(out);
      validated = (parsed?.signals ?? []).filter(Boolean);
    } catch (e: any) {
      await log("error", `Hermes validate failed: ${e.message}`);
    }
  }

  // Persist signals
  const signalRows = validated.map((s) => ({
    epic: s.epic, name: s.name ?? null, direction: s.direction,
    entry_price: s.entry_price, stop_loss: s.stop_loss, take_profit: s.take_profit,
    confidence: s.confidence, justification: s.justification ?? null,
    status: "pending", raw: s as any,
  }));
  let signalIdsByEpic = new Map<string, string>();
  if (signalRows.length > 0) {
    const { data: inserted } = await supabaseAdmin.from("signals").insert(signalRows).select();
    inserted?.forEach((row: any) => signalIdsByEpic.set(row.epic + ":" + row.direction, row.id));
  }

  // Risk sizing
  const { orders, daily_loss_limit_hit, skipped } = buildOrders(validated, instruments, {
    equity: session.accountEquity,
    realized_daily_pnl: realized,
    max_risk_per_trade_pct: Number(settings.max_risk_per_trade_pct),
    max_daily_loss_pct: Number(settings.max_daily_loss_pct),
    min_confidence: Number(settings.min_confidence),
  });

  if (daily_loss_limit_hit) {
    await supabaseAdmin.from("daily_pnl").upsert({
      date: today, realized_pnl: realized, loss_cap_hit: true,
    }, { onConflict: "date" });
  }

  // Execute
  let executed = 0;
  if (settings.auto_execute) {
    for (const o of orders) {
      const sigId = signalIdsByEpic.get(o.epic + ":" + o.direction) ?? null;
      const ig = await igCreatePosition(session, {
        epic: o.epic, direction: o.direction, size: o.size,
        stopLevel: o.stop_loss, limitLevel: o.take_profit,
      });
      const status = ig.ok ? "submitted" : "error";
      await supabaseAdmin.from("orders").insert({
        signal_id: sigId, epic: o.epic, direction: o.direction, size: o.size,
        stop_loss: o.stop_loss, take_profit: o.take_profit,
        deal_reference: ig.body?.dealReference ?? null,
        status, raw: ig.body as any,
      });
      if (sigId) {
        await supabaseAdmin.from("signals").update({
          status: ig.ok ? "executed" : "rejected",
        }).eq("id", sigId);
      }
      if (ig.ok) executed++;
    }
  }

  await log("scan", `Scan complete: ${validated.length} validated, ${orders.length} built, ${executed} executed`, {
    env, equity: session.accountEquity, realized, skipped,
    quotes: quotes.map((q) => ({ epic: q.epic, bid: q.bid, ask: q.ask })),
  });

  return {
    ok: true, environment: env,
    equity: session.accountEquity, realized_pnl: realized,
    daily_loss_limit_hit,
    signals_generated: rawSignals.length,
    signals_validated: validated.length,
    orders_built: orders.length, orders_executed: executed,
    details: { skipped },
  };
}

export async function runEodClose(): Promise<{ closed: number; equity: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin
    .from("app_settings").select("environment").eq("id", 1).single();
  const env = ((settings as any)?.environment as IgEnv) ?? "demo";

  const session = await igLogin(env);
  const { igGetPositions, igClosePosition } = await import("./ig.server");
  const { positions } = await igGetPositions(session);

  let closed = 0;
  for (const p of positions ?? []) {
    const r = await igClosePosition(session, {
      dealId: p.position.dealId,
      direction: p.position.direction,
      size: Number(p.position.size),
      epic: p.market.epic,
    });
    if (r.ok) closed++;
  }

  const today = ymdInEst();
  await supabaseAdmin.from("daily_pnl").upsert({
    date: today,
    equity_close: session.accountEquity,
    positions_closed_at_eod: closed,
  }, { onConflict: "date" });

  await log("eod", `EOD close ${closed} positions, equity ${session.accountEquity}`, { env });

  return { closed, equity: session.accountEquity };
}

async function baseResult(env: IgEnv, reason: string): Promise<ScanResult> {
  return {
    ok: true, environment: env, equity: 0, realized_pnl: 0,
    signals_generated: 0, signals_validated: 0,
    orders_built: 0, orders_executed: 0, skipped_reason: reason,
  };
}

async function log(kind: string, message: string, data?: any) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("trade_log").insert({ kind, message, data: data ?? null });
  } catch {}
}
