// Notifications: webhook (HMAC-signed) + Gmail (via Lovable connector gateway).
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

export interface NotifyResult {
  webhook?: { ok: boolean; status?: number; error?: string };
  email?: { ok: boolean; status?: number; error?: string; message_id?: string };
}

function subjectFor(p: NotifyPayload): string {
  switch (p.type) {
    case "loss_cap_triggered":
      return `[VDNX] Daily loss cap hit — auto-execute paused (${p.date})`;
    case "eod_close":
      return `[VDNX] EOD close — ${p.date}`;
    case "error":
      return `[VDNX] Error: ${p.message ?? "unknown"}`;
    case "test":
      return `[VDNX] Test notification`;
  }
}

function bodyFor(p: NotifyPayload): string {
  const lines: string[] = [
    `Type: ${p.type}`,
    `Timestamp: ${p.ts}`,
  ];
  if (p.date) lines.push(`Date: ${p.date}`);
  if (p.equity !== undefined) lines.push(`Equity: ${p.equity}`);
  if (p.daily_pnl !== undefined) lines.push(`Daily realized P&L: ${p.daily_pnl}`);
  if (p.cap_pct !== undefined) lines.push(`Daily loss cap: ${(p.cap_pct * 100).toFixed(2)}%`);
  if (p.message) lines.push(`Message: ${p.message}`);
  if (p.data) lines.push(`Data: ${JSON.stringify(p.data, null, 2)}`);
  lines.push("", "— VDNX Trader");
  return lines.join("\n");
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendGmail(to: string, subject: string, body: string): Promise<NotifyResult["email"]> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !gmailKey) {
    return { ok: false, error: "gmail_connector_not_configured" };
  }
  const rfc2822 = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");
  const raw = b64url(rfc2822);

  try {
    const r = await fetch(
      "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": gmailKey,
        },
        body: JSON.stringify({ raw }),
      }
    );
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, status: r.status, error: j?.error?.message ?? JSON.stringify(j).slice(0, 200) };
    }
    return { ok: true, status: r.status, message_id: j?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function sendNotification(payload: NotifyPayload): Promise<NotifyResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cfg } = await supabaseAdmin
    .from("notification_settings").select("*").eq("id", 1).single();

  const out: NotifyResult = {};

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
    out.email = await sendGmail(cfg.email_to, subjectFor(payload), bodyFor(payload));
  }

  return out;
}
