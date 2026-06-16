import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDashboard, getInstruments, updateSettings } from "@/lib/trading.functions";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const fetchDash = useServerFn(getDashboard);
  const fetchInst = useServerFn(getInstruments);
  const update = useServerFn(updateSettings);
  const qc = useQueryClient();

  const d = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDash() });
  const ins = useQuery({ queryKey: ["instruments"], queryFn: () => fetchInst() });

  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (d.data?.settings && !form) setForm(d.data.settings); }, [d.data, form]);

  const save = useMutation({
    mutationFn: async (patch: any) => await update({ data: patch }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });

  if (!form) return <div className="text-muted-foreground">Loading…</div>;

  function set(k: string, v: any) { setForm({ ...form, [k]: v }); }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate({
      environment: form.environment,
      live_confirmed: form.live_confirmed,
      auto_execute: form.auto_execute,
      min_confidence: Number(form.min_confidence),
      max_risk_per_trade_pct: Number(form.max_risk_per_trade_pct),
      max_daily_loss_pct: Number(form.max_daily_loss_pct),
      session_start_est: form.session_start_est,
      session_end_est: form.session_end_est,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6 max-w-2xl">
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
