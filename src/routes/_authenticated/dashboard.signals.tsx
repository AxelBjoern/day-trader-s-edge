import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSignals } from "@/lib/trading.functions";

export const Route = createFileRoute("/_authenticated/dashboard/signals")({
  component: SignalsPage,
});

function SignalsPage() {
  const fn = useServerFn(getSignals);
  const q = useQuery({ queryKey: ["signals"], queryFn: () => fn(), refetchInterval: 30000 });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Signals</h1>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Time</th><th>Epic</th><th>Dir</th>
              <th>Entry</th><th>Stop</th><th>Target</th><th>Conf</th><th>Status</th>
              <th className="text-left">Justification</th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((s: any) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-2">{new Date(s.created_at).toLocaleString()}</td>
                <td className="text-center">{s.epic}</td>
                <td className={`text-center ${s.direction === "BUY" ? "text-bull" : "text-bear"}`}>{s.direction}</td>
                <td className="text-center">{s.entry_price}</td>
                <td className="text-center">{s.stop_loss}</td>
                <td className="text-center">{s.take_profit}</td>
                <td className="text-center">{Number(s.confidence ?? 0).toFixed(2)}</td>
                <td className="text-center">{s.status}</td>
                <td className="p-2 max-w-xs text-muted-foreground">{s.justification}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
