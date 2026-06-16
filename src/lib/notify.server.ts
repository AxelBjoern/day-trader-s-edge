// Notifications: webhook (HMAC-signed) + email (best-effort via Lovable email infra if available).
import { createHmac } from "crypto";

export interface NotifyPayload {
  type: "loss_cap_triggered" | "eod_close" | "error" | "test";
  date?: string;
  equity?: number;
  daily_pnl?: number;
  cap_pct?: number;
  message?: string;
  data?: any;
  ts: string;
}

export async function sendNotification(payload: NotifyPayload): Promise<{
  webhook?: { ok: boolean; status?: number; error?: string };
  email?: { ok: boolean; error?: string };
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cfg } = await supabaseAdmin
    .from("notification_settings").select("*").eq("id", 1).single();

  const out: any = {};

  if (cfg?.webhook_enabled && cfg.webhook_url) {
    try {
      const body = JSON.stringify(payload);
      const secret = process.env.CRON_SECRET ?? "";
      const sig = secret
        ? createHmac("sha256", secret).update(body).digest("hex")
        : "";
      const r = await fetch(cfg.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sig ? { "x-vdnx-signature": sig } : {}),
        },
        body,
      });
      out.webhook = { ok: r.ok, status: r.status };
    } catch (e: any) {
      out.webhook = { ok: false, error: e?.message ?? String(e) };
    }
  }

  if (cfg?.email_enabled && cfg.email_to) {
    // Email is a no-op stub until Lovable email infra is provisioned for this project.
    // The notification is logged so it's visible in trade_log; configure email infra to enable real sends.
    out.email = { ok: false, error: "email_infra_not_configured" };
  }

  return out;
}
