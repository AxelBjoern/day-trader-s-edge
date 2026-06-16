import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getDashboard, manualScan, manualClose, getCronStatus } from "@/lib/trading.functions";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function pct(n: number) { return (n * 100).toFixed(1) + "%"; }
function money(n: number) { return (n >= 0 ? "+" : "") + n.toFixed(2); }
function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Dashboard() {
  const fetchDash = useServerFn(getDashboard);
  const fetchCron = useServerFn(getCronStatus);
  const scanFn = useServerFn(manualScan);
  const closeFn = useServerFn(manualClose);
  const [msg, setMsg] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDash(), refetchInterval: 15000 });
  const cron = useQuery({ queryKey: ["cron-status"], queryFn: () => fetchCron(), refetchInterval: 15000 });

  const scan = useMutation({
    mutationFn: async (dryRun: boolean) => await scanFn({ data: { dryRun } }),
    onSuccess: (r: any) => { setMsg(`Scan: ${JSON.stringify(r).slice(0, 300)}`); q.refetch(); cron.refetch(); },
    onError: (e: any) => setMsg(`Error: ${e.message}`),
  });
  const closeAll = useMutation({
    mutationFn: async () => await closeFn(),
    onSuccess: (r: any) => { setMsg(`Closed ${r.closed ?? 0} positions`); q.refetch(); cron.refetch(); },
    onError: (e: any) => setMsg(`Error: ${e.message}`),
  });

  if (q.isLoading) return <div className="text-muted-foreground">Loading...</div>;
  if (q.error) return <div className="text-bear">Error: {(q.error as any).message}</div>;

  const d = q.data!;
  const s: any = d.settings;
  const realized = Number(d.today_pnl?.realized_pnl ?? 0);
  const equity = Number(d.today_pnl?.equity_open ?? 0);
  const maxLoss = equity * Number(s?.max_daily_loss_pct ?? 0.05);
  const lossUsed = realized < 0 ? Math.min(100, (Math.abs(realized) / Math.max(maxLoss, 1)) * 100) : 0;
  const dryRun = !!s?.dry_run;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Overview</div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            {s?.environment === "live" ? "LIVE" : "DEMO"} ·
            <span className={`${s?.auto_execute ? "text-primary" : "text-muted-foreground"}`}>
              {s?.auto_execute ? "AUTO-EXEC ON" : "AUTO-EXEC OFF"}
            </span>
            {dryRun && (
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] tracking-wider text-muted-foreground">DRY RUN</span>
            )}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => scan.mutate(false)} disabled={scan.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {scan.isPending ? "Scanning…" : "Scan now"}
          </button>
          <button onClick={() => scan.mutate(true)} disabled={scan.isPending}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Dry-run scan
          </button>
          <button onClick={() => { if (confirm("Close ALL open positions?")) closeAll.mutate(); }}
            disabled={closeAll.isPending}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50">
            {closeAll.isPending ? "Closing…" : "Close all"}
          </button>
        </div>
      </div>

      {msg && <div className="rounded-md border border-border bg-card p-3 text-xs font-mono break-all">{msg}</div>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Today realized" value={money(realized)} tone={realized >= 0 ? "bull" : "bear"} />
        <Stat label="Equity (open)" value={equity.toFixed(2)} />
        <Stat label="Daily loss used" value={pct(lossUsed / 100)} tone={lossUsed > 80 ? "bear" : undefined} />
        <Stat label="Min confidence" value={Number(s?.min_confidence ?? 0).toFixed(2)} />
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-bear" style={{ width: `${lossUsed}%` }} />
      </div>

      <Card title="Cron status">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(["scan", "eod_close"] as const).map((j) => {
            const info = cron.data?.[j];
            const last = info?.last;
            const recent: any[] = info?.recent ?? [];
            return (
              <div key={j} className="rounded border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">{j}</span>
                  {last ? (
                    <span className={`rounded px-2 py-0.5 text-[10px] ${
                      last.status === "success" ? "bg-bull/20 text-bull" :
                      last.status === "error" ? "bg-bear/20 text-bear" :
                      "bg-muted text-muted-foreground"
                    }`}>{last.status}</span>
                  ) : <span className="text-[10px] text-muted-foreground">no runs</span>}
                </div>
                <div className="mt-1 text-sm">{last ? ago(last.started_at) : "—"}</div>
                <div className="mt-2 flex gap-1">
                  {recent.slice().reverse().map((r: any) => (
                    <span key={r.id} title={`${r.status} · ${new Date(r.started_at).toLocaleString()}`}
                      className={`h-2 w-2 rounded-full ${
                        r.status === "success" ? "bg-bull" :
                        r.status === "error" ? "bg-bear" :
                        r.status === "skipped" ? "bg-muted-foreground/40" :
                        "bg-primary"
                      }`} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={`Recent signals (${d.signals.length})`}>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="text-left py-1">Time</th><th>Epic</th><th>Dir</th><th>Conf</th><th>Status</th></tr>
            </thead>
            <tbody>
              {d.signals.slice(0, 10).map((s: any) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-1">{new Date(s.created_at).toLocaleTimeString()}</td>
                  <td className="text-center">{s.epic.split(".")[2]}</td>
                  <td className={`text-center ${s.direction === "BUY" ? "text-bull" : "text-bear"}`}>{s.direction}</td>
                  <td className="text-center">{Number(s.confidence ?? 0).toFixed(2)}</td>
                  <td className="text-center">{s.status}</td>
                </tr>
              ))}
              {d.signals.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No signals yet</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card title={`Recent orders (${d.orders.length})`}>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="text-left py-1">Time</th><th>Epic</th><th>Dir</th><th>Size</th><th>Status</th></tr>
            </thead>
            <tbody>
              {d.orders.slice(0, 10).map((o: any) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="py-1">{new Date(o.created_at).toLocaleTimeString()}</td>
                  <td className="text-center">{o.epic.split(".")[2]}</td>
                  <td className={`text-center ${o.direction === "BUY" ? "text-bull" : "text-bear"}`}>{o.direction}</td>
                  <td className="text-center">{o.size}</td>
                  <td className={`text-center ${o.status === "dry_run" ? "text-muted-foreground" : ""}`}>{o.status}</td>
                </tr>
              ))}
              {d.orders.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No orders yet</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {d.last_scan && (
        <div className="text-xs text-muted-foreground">
          Last activity: {new Date(d.last_scan.created_at).toLocaleString()} — {d.last_scan.message}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
