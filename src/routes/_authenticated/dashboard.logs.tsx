import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getLogs } from "@/lib/trading.functions";

export const Route = createFileRoute("/_authenticated/dashboard/logs")({
  component: LogsPage,
});

function LogsPage() {
  const fn = useServerFn(getLogs);
  const q = useQuery({ queryKey: ["logs"], queryFn: () => fn(), refetchInterval: 15000 });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Trade Log</h1>
      <div className="space-y-2">
        {(q.data ?? []).map((l: any) => (
          <div key={l.id} className="rounded-md border border-border bg-card p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-primary">{l.kind}</span>
              <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
            </div>
            <div className="mt-1">{l.message}</div>
            {l.data && (
              <pre className="mt-2 overflow-x-auto text-[10px] text-muted-foreground">
                {JSON.stringify(l.data, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
