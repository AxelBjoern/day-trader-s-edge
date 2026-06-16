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
    // If switching to live, require explicit live_confirmed elsewhere
    const { error } = await supabaseAdmin
      .from("app_settings").update(data).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const manualScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { runScan } = await import("./scan.server");
    return await runScan({ manual: true, forceIgnoreSession: true });
  });

export const manualClose = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { runEodClose } = await import("./scan.server");
    return await runEodClose();
  });
