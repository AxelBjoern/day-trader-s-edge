import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { getPerformance, exportPnlCsv, exportOrdersCsv } from "@/lib/trading.functions";

export const Route = createFileRoute("/_authenticated/dashboard/performance")({
  component: Performance,
});

const RANGES: Array<{ label: string; days: number }> = [
  { label: "7d", days: 7 }, { label: "30d", days: 30 },
  { label: "90d", days: 90 }, { label: "1y", days: 365 },
];

function Performance() {
  const fetchPerf = useServerFn(getPerformance);
  const pnlCsv = useServerFn(exportPnlCsv);
  const ordCsv = useServerFn(exportOrdersCsv);
  const [days, setDays] = useState(30);

  const q = useQuery({
    queryKey: ["performance", days],
    queryFn: () => fetchPerf({ data: { days } }),
  });

  async function download(kind: "pnl" | "orders") {
    const text = kind === "pnl"
      ? await pnlCsv({ data: { days } })
      : await ordCsv({ data: { days } });
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vdnx-${kind}-${days}d-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (q.isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (q.error) return <div className="text-bear">Error: {(q.error as any).message}</div>;
  const d = q.data!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Performance</h1>
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)}
              className={`rounded-md border border-border px-3 py-1 text-xs ${days === r.days ? "bg-primary text-primary-foreground" : "bg-card"}`}>
              {r.label}
            </button>
          ))}
          <button onClick={() => download("pnl")}
            className="rounded-md border border-border bg-card px-3 py-1 text-xs">Export P&amp;L CSV</button>
          <button onClick={() => download("orders")}
            className="rounded-md border border-border bg-card px-3 py-1 text-xs">Export orders CSV</button>
        </div>
      </div>

      <Card title={`Realized P&L · last ${days}d`}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={d.series}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="realized" stroke="hsl(var(--bull))" dot={false} name="Daily realized" />
              <Line type="monotone" dataKey="cumulative" stroke="hsl(var(--primary))" dot={false} name="Cumulative" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title={`Orders by day · last ${days}d`}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.orders_by_day}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="submitted" stackId="a" fill="hsl(var(--bull))" name="Submitted" />
              <Bar dataKey="closed" stackId="a" fill="hsl(var(--primary))" name="Closed" />
              <Bar dataKey="dry_run" stackId="a" fill="hsl(var(--muted-foreground))" name="Dry-run" />
              <Bar dataKey="error" stackId="a" fill="hsl(var(--bear))" name="Error/Reject" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Per-instrument breakdown">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr><th className="text-left py-1">Epic</th><th>Trades</th><th>Wins</th><th>Win rate</th><th className="text-right">Realized</th></tr>
          </thead>
          <tbody>
            {d.instruments.map((i: any) => (
              <tr key={i.epic} className="border-t border-border">
                <td className="py-1">{i.epic}</td>
                <td className="text-center">{i.trades}</td>
                <td className="text-center">{i.wins}</td>
                <td className="text-center">{i.trades > 0 ? ((i.wins / i.trades) * 100).toFixed(0) + "%" : "—"}</td>
                <td className={`text-right ${i.realized >= 0 ? "text-bull" : "text-bear"}`}>{i.realized.toFixed(2)}</td>
              </tr>
            ))}
            {d.instruments.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No trades yet</td></tr>
            )}
          </tbody>
        </table>
      </Card>
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
