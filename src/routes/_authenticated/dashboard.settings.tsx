import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDashboard, getInstruments, updateSettings,
  getNotificationSettings, updateNotificationSettings, sendTestNotification,
  checkIgConnection,
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
  const qc = useQueryClient();

  const d = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDash() });
  const ins = useQuery({ queryKey: ["instruments"], queryFn: () => fetchInst() });
  const notif = useQuery({ queryKey: ["notif-settings"], queryFn: () => fetchNotif() });

  const [form, setForm] = useState<any>(null);
  const [nform, setNform] = useState<any>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [igResult, setIgResult] = useState<{ ok: boolean; text: string } | null>(null);


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
    onSuccess: (r: any) => setIgResult({ ok: !!r?.ok, text: JSON.stringify(r) }),
    onError: (e: any) => setIgResult({ ok: false, text: `Error: ${e.message}` }),
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
          <div className="rounded-md border border-border bg-card p-3 text-xs font-mono break-all">{testResult}</div>
        )}
      </form>
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
