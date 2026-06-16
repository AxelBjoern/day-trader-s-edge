import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function requireAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId, _role: "admin",
  });
  if (!data) throw new Error("Forbidden: admin required");
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ymdInEst } = await import("./ig.server");
    const today = ymdInEst();
    const [settings, pnl, recentSignals, recentOrders, lastLog] = await Promise.all([
      supabaseAdmin.from("app_settings").select("*").eq("id", 1).single(),
      supabaseAdmin.from("daily_pnl").select("*").eq("date", today).maybeSingle(),
      supabaseAdmin.from("signals").select("*").order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("trade_log").select("*").order("created_at", { ascending: false }).limit(1),
    ]);
    return {
      settings: settings.data,
      today_pnl: pnl.data,
      signals: recentSignals.data ?? [],
      orders: recentOrders.data ?? [],
      last_scan: lastLog.data?.[0] ?? null,
      today,
    };
  });

export const getSignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("signals").select("*").order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const getOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("orders").select("*").order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const getLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("trade_log").select("*").order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const getInstruments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("instruments").select("*").order("name");
    return data ?? [];
  });

const SettingsSchema = z.object({
  environment: z.enum(["demo", "live"]).optional(),
  live_confirmed: z.boolean().optional(),
  auto_execute: z.boolean().optional(),
  dry_run: z.boolean().optional(),
  min_confidence: z.number().min(0).max(1).optional(),
  max_risk_per_trade_pct: z.number().min(0).max(0.5).optional(),
  max_daily_loss_pct: z.number().min(0).max(0.5).optional(),
  session_start_est: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  session_end_est: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings").update(data).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const manualScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dryRun: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { runScan } = await import("./scan.server");
    const { recordJobRun } = await import("./jobs.server");
    return await recordJobRun("scan", () => runScan({
      manual: true, forceIgnoreSession: true, dryRunOverride: data.dryRun,
    }), { dryRun: data.dryRun });
  });

export const manualClose = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { runEodClose } = await import("./scan.server");
    const { recordJobRun } = await import("./jobs.server");
    return await recordJobRun("eod_close", () => runEodClose({ force: true }));
  });

// ----- Performance + CSV -----

export const getPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(365).optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const sinceDate = since.slice(0, 10);

    const [pnl, orders] = await Promise.all([
      supabaseAdmin.from("daily_pnl").select("*").gte("date", sinceDate).order("date"),
      supabaseAdmin.from("orders").select("*").gte("created_at", since).order("created_at"),
    ]);

    const pnlRows = pnl.data ?? [];
    let cum = 0;
    const series = pnlRows.map((r: any) => {
      cum += Number(r.realized_pnl ?? 0);
      return {
        date: r.date,
        realized: Number(r.realized_pnl ?? 0),
        cumulative: cum,
        equity_open: r.equity_open ? Number(r.equity_open) : null,
        equity_close: r.equity_close ? Number(r.equity_close) : null,
        loss_cap_hit: !!r.loss_cap_hit,
      };
    });

    // Orders bucketed by day + status
    const byDay = new Map<string, { date: string; submitted: number; dry_run: number; error: number; closed: number; total: number }>();
    const byInstrument = new Map<string, { epic: string; trades: number; wins: number; realized: number }>();
    for (const o of orders.data ?? []) {
      const d = (o.created_at as string).slice(0, 10);
      const b = byDay.get(d) ?? { date: d, submitted: 0, dry_run: 0, error: 0, closed: 0, total: 0 };
      b.total++;
      if (o.status === "submitted") b.submitted++;
      else if (o.status === "dry_run") b.dry_run++;
      else if (o.status === "error" || o.status === "rejected") b.error++;
      else if (o.status === "closed") b.closed++;
      byDay.set(d, b);

      const inst = byInstrument.get(o.epic) ?? { epic: o.epic, trades: 0, wins: 0, realized: 0 };
      inst.trades++;
      const pnl = Number(o.realized_pnl ?? 0);
      inst.realized += pnl;
      if (pnl > 0) inst.wins++;
      byInstrument.set(o.epic, inst);
    }

    return {
      days,
      series,
      orders_by_day: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
      instruments: Array.from(byInstrument.values()).sort((a, b) => b.realized - a.realized),
    };
  });

export const exportPnlCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(365).optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { toCsv } = await import("./csv.server");
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const { data: rows } = await supabaseAdmin
      .from("daily_pnl").select("*").gte("date", since).order("date");
    return toCsv(rows ?? [], [
      "date", "realized_pnl", "equity_open", "equity_close",
      "positions_closed_at_eod", "loss_cap_hit", "eod_closed_at",
    ]);
  });

export const exportOrdersCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(365).optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { toCsv } = await import("./csv.server");
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("orders").select("*").gte("created_at", since).order("created_at", { ascending: false });
    return toCsv(rows ?? [], [
      "created_at", "epic", "direction", "size", "status",
      "stop_loss", "take_profit", "fill_level", "close_level",
      "realized_pnl", "deal_reference", "deal_id", "closed_at",
    ]);
  });

// ----- Jobs / cron status -----

export const getJobRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    job: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("job_runs").select("*").order("started_at", { ascending: false }).limit(data.limit ?? 100);
    if (data.job) q = q.eq("job_name", data.job);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const getCronStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const jobs = ["scan", "eod_close"];
    const out: Record<string, any> = {};
    for (const j of jobs) {
      const { data } = await supabaseAdmin
        .from("job_runs").select("*")
        .eq("job_name", j).order("started_at", { ascending: false }).limit(20);
      out[j] = { last: data?.[0] ?? null, recent: data ?? [] };
    }
    return out;
  });

// ----- Notification settings -----

export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("notification_settings").select("*").eq("id", 1).single();
    return data;
  });

const NotifSchema = z.object({
  email_enabled: z.boolean().optional(),
  email_to: z.string().email().nullable().optional(),
  webhook_enabled: z.boolean().optional(),
  webhook_url: z.string().url().nullable().optional(),
  notify_on_loss_cap: z.boolean().optional(),
  notify_on_eod: z.boolean().optional(),
  notify_on_errors: z.boolean().optional(),
});

export const updateNotificationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => NotifSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("notification_settings").update(data).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { sendNotification } = await import("./notify.server");
    return await sendNotification({
      type: "test",
      message: "VDNX test notification",
      ts: new Date().toISOString(),
    });
  });
