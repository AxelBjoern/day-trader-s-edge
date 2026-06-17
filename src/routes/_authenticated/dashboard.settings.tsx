import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDashboard, getInstruments, updateSettings,
  getNotificationSettings, updateNotificationSettings, sendTestNotification,
  checkIgConnection, checkOpenRouterConnection,
} from "@/lib/trading.functions";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const fetchDash = useServerFn(getDashboard);
  const fetchInst = useServerFn(getInstruments);
  const update = useServerFn(updateSettings);
  const fetchNotif = useServerFn(getNotificationSettings);
  const updateNotif = useServerFn(updateNotificationSettings);
  const testNotif = useServerFn(sendTestNotification);
  const igCheck = useServerFn(checkIgConnection);
  const routerCheck = useServerFn(checkOpenRouterConnection);
  const qc = useQueryClient();

  const d = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDash() });
  const ins = useQuery({ queryKey: ["instruments"], queryFn: () => fetchInst() });
  const notif = useQuery({ queryKey: ["notif-settings"], queryFn: () => fetchNotif() });

  const [form, setForm] = useState<any>(null);
  const [nform, setNform] = useState<any>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [igResult, setIgResult] = useState<any | null>(null);
  const [igBoth, setIgBoth] = useState<{ demo: any | null; live: any | null } | null>(null);
  const [routerResult, setRouterResult] = useState<{ ok: boolean; text: string } | null>(null);


  useEffect(() => { if (d.data?.settings && !form) setForm(d.data.settings); }, [d.data, form]);
  useEffect(() => { if (notif.data && !nform) setNform(notif.data); }, [notif.data, nform]);

  const save = useMutation({
    mutationFn: async (patch: any) => await update({ data: patch }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
  const saveNotif = useMutation({
    mutationFn: async (patch: any) => await updateNotif({ data: patch }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notif-settings"] }); },
  });
  const sendTest = useMutation({
    mutationFn: async () => await testNotif(),
    onSuccess: (r: any) => {
      const emailOk = r?.email?.ok;
      const webhookOk = r?.webhook?.ok;
      const sent = r?.email || r?.webhook;
      const ok = sent ? !!(emailOk || webhookOk) : false;
      setTestResult({ ok, text: JSON.stringify(r) });
    },
    onError: (e: any) => setTestResult({ ok: false, text: `Error: ${e.message}` }),
  });
  const runIgCheck = useMutation({
    mutationFn: async () => await igCheck({ data: {} }),
    onSuccess: (r: any) => setIgResult(r),
    onError: (e: any) => setIgResult({ ok: false, error: e.message, error_code: "client-error", next_step: "Retry — the request didn't reach the server." }),
  });
  const runIgBothCheck = useMutation({
    mutationFn: async () => {
      const [demo, live] = await Promise.all([
        igCheck({ data: { environment: "demo" } }).catch((e: any) => ({
          ok: false, environment: "demo", error: e.message,
          error_code: "client-error", next_step: "Retry — request didn't reach the server.",
        })),
        igCheck({ data: { environment: "live" } }).catch((e: any) => ({
          ok: false, environment: "live", error: e.message,
          error_code: "client-error", next_step: "Retry — request didn't reach the server.",
        })),
      ]);
      return { demo, live };
    },
    onSuccess: (r) => setIgBoth(r),
    onError: (e: any) => setIgBoth({
      demo: { ok: false, environment: "demo", error: e.message, error_code: "client-error" },
      live: { ok: false, environment: "live", error: e.message, error_code: "client-error" },
    }),
  });
  const runRouterCheck = useMutation({
    mutationFn: async () => await routerCheck(),
    onSuccess: (r: any) => setRouterResult({ ok: !!r?.ok, text: JSON.stringify(r) }),
    onError: (e: any) => setRouterResult({ ok: false, text: `Error: ${e.message}` }),
  });

  if (!form || !nform) return <div className="text-muted-foreground">Loading…</div>;

  function set(k: string, v: any) { setForm({ ...form, [k]: v }); }
  function setN(k: string, v: any) { setNform({ ...nform, [k]: v }); }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate({
      environment: form.environment,
      live_confirmed: form.live_confirmed,
      auto_execute: form.auto_execute,
      dry_run: form.dry_run,
      min_confidence: Number(form.min_confidence),
      max_risk_per_trade_pct: Number(form.max_risk_per_trade_pct),
      max_daily_loss_pct: Number(form.max_daily_loss_pct),
      session_start_est: form.session_start_est,
      session_end_est: form.session_end_est,
    });
  }
  function submitNotif(e: React.FormEvent) {
    e.preventDefault();
    saveNotif.mutate({
      email_enabled: nform.email_enabled,
      email_to: nform.email_to || null,
      webhook_enabled: nform.webhook_enabled,
      webhook_url: nform.webhook_url || null,
      notify_on_loss_cap: nform.notify_on_loss_cap,
      notify_on_eod: nform.notify_on_eod,
      notify_on_errors: nform.notify_on_errors,
    });
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <form onSubmit={submit} className="space-y-6">
        <h1 className="text-xl font-bold">Settings</h1>

        <Section title="Environment">
          <Field label="Mode">
            <select value={form.environment} onChange={(e) => set("environment", e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="demo">Demo</option>
              <option value="live">Live</option>
            </select>
          </Field>
          {form.environment === "live" && (
            <Field label="I confirm I want to trade LIVE money">
              <input type="checkbox" checked={!!form.live_confirmed}
                onChange={(e) => set("live_confirmed", e.target.checked)} />
            </Field>
          )}
        </Section>

        <Section title="Execution">
          <Field label="Auto-execute approved confidence signals">
            <input type="checkbox" checked={!!form.auto_execute}
              onChange={(e) => set("auto_execute", e.target.checked)} />
          </Field>
          <Field label="Dry-run (paper trade — simulate, do not place orders)">
            <input type="checkbox" checked={!!form.dry_run}
              onChange={(e) => set("dry_run", e.target.checked)} />
          </Field>
          <Field label="Min confidence (0–1)">
            <input type="number" step="0.05" min="0" max="1" value={form.min_confidence}
              onChange={(e) => set("min_confidence", e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-32" />
          </Field>
        </Section>

        <Section title="Risk">
          <Field label="Max risk per trade (%)">
            <input type="number" step="0.005" min="0" max="0.5" value={form.max_risk_per_trade_pct}
              onChange={(e) => set("max_risk_per_trade_pct", e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-32" />
          </Field>
          <Field label="Max daily loss (%)">
            <input type="number" step="0.005" min="0" max="0.5" value={form.max_daily_loss_pct}
              onChange={(e) => set("max_daily_loss_pct", e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-32" />
          </Field>
        </Section>

        <Section title="Session window (EST)">
          <Field label="Start">
            <input type="text" placeholder="09:30" value={form.session_start_est}
              onChange={(e) => set("session_start_est", e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-32" />
          </Field>
          <Field label="End">
            <input type="text" placeholder="16:00" value={form.session_end_est}
              onChange={(e) => set("session_end_est", e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-32" />
          </Field>
        </Section>

        <Section title="Instruments">
          <ul className="text-sm">
            {(ins.data ?? []).map((i: any) => (
              <li key={i.id} className="flex items-center justify-between border-b border-border py-2">
                <div>
                  <div className="font-semibold">{i.name}</div>
                  <div className="text-xs text-muted-foreground">{i.epic} · {i.type} · min stop {i.min_stop_distance_points}</div>
                </div>
                <span className={i.enabled ? "text-bull text-xs" : "text-muted-foreground text-xs"}>
                  {i.enabled ? "ENABLED" : "DISABLED"}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <button type="submit" disabled={save.isPending}
          className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
        {save.isSuccess && <span className="ml-3 text-xs text-bull">Saved.</span>}
        {save.error && <span className="ml-3 text-xs text-bear">{(save.error as any).message}</span>}
      </form>

      <form onSubmit={submitNotif} className="space-y-4">
        <Section title="Notifications (loss-cap, EOD, errors)">
          <Field label="Webhook enabled">
            <input type="checkbox" checked={!!nform.webhook_enabled}
              onChange={(e) => setN("webhook_enabled", e.target.checked)} />
          </Field>
          <Field label="Webhook URL (HMAC-signed via x-vdnx-signature)">
            <input type="url" placeholder="https://hooks.example.com/vdnx" value={nform.webhook_url ?? ""}
              onChange={(e) => setN("webhook_url", e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-80" />
          </Field>
          <Field label="Email enabled (requires email infra)">
            <input type="checkbox" checked={!!nform.email_enabled}
              onChange={(e) => setN("email_enabled", e.target.checked)} />
          </Field>
          <Field label="Email recipient">
            <input type="email" placeholder="alerts@example.com" value={nform.email_to ?? ""}
              onChange={(e) => setN("email_to", e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-80" />
          </Field>
          <Field label="Notify on loss-cap trigger">
            <input type="checkbox" checked={!!nform.notify_on_loss_cap}
              onChange={(e) => setN("notify_on_loss_cap", e.target.checked)} />
          </Field>
          <Field label="Notify on EOD close">
            <input type="checkbox" checked={!!nform.notify_on_eod}
              onChange={(e) => setN("notify_on_eod", e.target.checked)} />
          </Field>
          <Field label="Notify on errors">
            <input type="checkbox" checked={!!nform.notify_on_errors}
              onChange={(e) => setN("notify_on_errors", e.target.checked)} />
          </Field>
        </Section>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saveNotif.isPending}
            className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {saveNotif.isPending ? "Saving…" : "Save notifications"}
          </button>
          <button type="button" onClick={() => sendTest.mutate()} disabled={sendTest.isPending}
            className="rounded-md border border-border bg-card px-6 py-2 text-sm font-semibold disabled:opacity-50">
            {sendTest.isPending ? "Sending…" : "Send test alert"}
          </button>
          {saveNotif.isSuccess && <span className="text-xs text-bull">Saved.</span>}
        </div>
        {testResult && (
          <div className={`rounded-md border p-3 text-xs ${testResult.ok ? "border-bull/40 bg-bull/10 text-bull" : "border-bear/40 bg-bear/10 text-bear"}`}>
            <div className="font-semibold mb-1">{testResult.ok ? "✓ Notification sent" : "✗ Notification failed"}</div>
            <div className="font-mono break-all text-[10px] opacity-80">{testResult.text}</div>
          </div>
        )}
      </form>

      <div className="space-y-3">
        <Section title="AI router connection">
          <div className="text-xs text-muted-foreground">
            Checks OpenRouter with the configured DeepSeek model before scans use it.
          </div>
          <button type="button" onClick={() => runRouterCheck.mutate()} disabled={runRouterCheck.isPending}
            className="rounded-md border border-border bg-card px-6 py-2 text-sm font-semibold disabled:opacity-50">
            {runRouterCheck.isPending ? "Checking…" : "Check AI router"}
          </button>
          {routerResult && (
            <div className={`rounded-md border p-3 text-xs ${routerResult.ok ? "border-bull/40 bg-bull/10 text-bull" : "border-bear/40 bg-bear/10 text-bear"}`}>
              <div className="font-semibold mb-1">{routerResult.ok ? "✓ AI router OK" : "✗ AI router failed"}</div>
              <div className="font-mono break-all text-[10px] opacity-80">{routerResult.text}</div>
            </div>
          )}
        </Section>

        <Section title="IG connection">
          <div className="text-xs text-muted-foreground">
            Logs in to IG using the configured environment ({form.environment.toUpperCase()}) and fetches the account snapshot.
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => runIgCheck.mutate()} disabled={runIgCheck.isPending}
              className="rounded-md border border-border bg-card px-6 py-2 text-sm font-semibold disabled:opacity-50">
              {runIgCheck.isPending ? "Checking…" : "Check IG connection"}
            </button>
            <button type="button" onClick={() => runIgBothCheck.mutate()} disabled={runIgBothCheck.isPending}
              className="rounded-md border border-border bg-card px-6 py-2 text-sm font-semibold disabled:opacity-50">
              {runIgBothCheck.isPending ? "Checking demo + live…" : "Check both (demo + live)"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span>If a check fails, sign in at the matching IG portal to verify the username/password, then regenerate the API key there:</span>
            <a href="https://demo.ig.com/" target="_blank" rel="noreferrer" className="underline hover:text-foreground">IG demo portal ↗</a>
            <a href="https://www.ig.com/" target="_blank" rel="noreferrer" className="underline hover:text-foreground">IG live portal ↗</a>
          </div>
          {igResult && <IgDiagnosticsPanel r={igResult} />}
          {igBoth && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Demo</div>
                <IgDiagnosticsPanel r={igBoth.demo} />
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Live</div>
                <IgDiagnosticsPanel r={igBoth.live} />
              </div>
            </div>
          )}
        </Section>

      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      {children}
    </label>
  );
}

function IgDiagnosticsPanel({ r }: { r: any }) {
  const ok = !!r?.ok;
  const tone = ok
    ? "border-bull/40 bg-bull/10 text-bull"
    : "border-bear/40 bg-bear/10 text-bear";
  return (
    <div className={`rounded-md border p-3 text-xs space-y-3 ${tone}`}>
      <div className="font-semibold">
        {ok ? "✓ IG connection OK" : "✗ IG connection failed"}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-foreground/90">
        <DiagRow label="Environment" value={(r.environment ?? "—").toUpperCase()} />
        <DiagRow label="Latency" value={r.latency_ms != null ? `${r.latency_ms} ms` : "—"} />
        <DiagRow
          label="Identifier"
          value={r.identifier ? `${r.identifier} (${r.identifier_len} chars)` : "— (not set)"}
        />
        <DiagRow
          label="API key"
          value={r.api_key_fingerprint ? `${r.api_key_fingerprint} (${r.api_key_len} chars)` : "— (not set)"}
        />
        <DiagRow label="Password" value={r.password_set ? `set (${r.password_len} chars)` : "— (not set)"} />
        {ok && (
          <>
            <DiagRow label="Equity" value={`${r.account_equity ?? 0} ${r.currency ?? ""}`} />
            <DiagRow label="Balance" value={`${r.account_balance ?? 0} ${r.currency ?? ""}`} />
            <DiagRow label="Open positions" value={String(r.open_positions ?? 0)} />
          </>
        )}
      </dl>

      {!ok && (
        <div className="space-y-2 border-t border-current/20 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider opacity-70">Error code</span>
            <code className="rounded bg-background/40 px-1.5 py-0.5 font-mono text-[11px]">
              {r.error_code ?? "unknown"}
              {r.http_status ? ` · HTTP ${r.http_status}` : ""}
            </code>
          </div>
          {r.next_step && (
            <div>
              <div className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5">Next step</div>
              <div className="text-[12px] leading-snug text-foreground">{r.next_step}</div>
            </div>
          )}
          {r.error && (
            <details className="text-[10px] opacity-70">
              <summary className="cursor-pointer">Raw error</summary>
              <div className="font-mono break-all mt-1">{r.error}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="opacity-70">{label}</dt>
      <dd className="font-mono break-all text-right">{value}</dd>
    </>
  );
}
