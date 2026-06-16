import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getDashboard, manualScan, manualClose } from "@/lib/trading.functions";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function pct(n: number) { return (n * 100).toFixed(1) + "%"; }
function money(n: number) { return (n >= 0 ? "+" : "") + n.toFixed(2); }

function Dashboard() {
  const fetchDash = useServerFn(getDashboard);
  const scanFn = useServerFn(manualScan);
  const closeFn = useServerFn(manualClose);
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDash(), refetchInterval: 15000 });

  const scan = useMutation({
    mutationFn: async () => await scanFn(),
    onSuccess: (r: any) => { setMsg(`Scan: ${JSON.stringify(r)}`); q.refetch(); },
    onError: (e: any) => setMsg(`Error: ${e.message}`),
  });
  const closeAll = useMutation({
    mutationFn: async () => await closeFn(),
    onSuccess: (r: any) => { setMsg(`Closed ${r.closed} positions`); q.refetch(); },
    onError: (e: any) => setMsg(`Error: ${e.message}`),
  });

  if (q.isLoading) return <div className="text-muted-foreground">Loading...</div>;
  if (q.error) return <div className="text-bear">Error: {(q.error as any).message}</div>;

  const d = q.data!;
  const s = d.settings;
  const realized = Number(d.today_pnl?.realized_pnl ?? 0);
  const equity = Number(d.today_pnl?.equity_open ?? 0);
  const maxLoss = equity * Number(s?.max_daily_loss_pct ?? 0.05);
  const lossUsed = realized < 0 ? Math.min(100, (Math.abs(realized) / Math.max(maxLoss, 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Overview</div>
          <h1 className="text-2xl font-bold">
            {s?.environment === "live" ? "LIVE" : "DEMO"} ·
            <span className={`ml-2 ${s?.auto_execute ? "text-primary" : "text-muted-foreground"}`}>
              {s?.auto_execute ? "AUTO-EXEC ON" : "AUTO-EXEC OFF"}
            </span>
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => scan.mutate()} disabled={scan.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {scan.isPending ? "Scanning…" : "Scan now"}
          </button>
          <button onClick={() => { if (confirm("Close ALL open positions?")) closeAll.mutate(); }}
            disabled={closeAll.isPending}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50">
            {closeAll.isPending ? "Closing…" : "Close all"}
          </button>
        </div>
      </div>

      {msg && <div className="rounded-md border border-border bg-card p-3 text-xs">{msg}</div>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Today realized" value={money(realized)} tone={realized >= 0 ? "bull" : "bear"} />
        <Stat label="Equity (open)" value={equity.toFixed(2)} />
        <Stat label="Daily loss used" value={pct(lossUsed / 100)} tone={lossUsed > 80 ? "bear" : undefined} />
        <Stat label="Min confidence" value={Number(s?.min_confidence ?? 0).toFixed(2)} />
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-bear" style={{ width: `${lossUsed}%` }} />
      </div>

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
                  <td className="text-center">{o.status}</td>
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
