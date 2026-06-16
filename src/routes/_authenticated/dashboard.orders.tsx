import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getOrders } from "@/lib/trading.functions";

export const Route = createFileRoute("/_authenticated/dashboard/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const fn = useServerFn(getOrders);
  const q = useQuery({ queryKey: ["orders"], queryFn: () => fn(), refetchInterval: 30000 });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Orders</h1>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Time</th><th>Epic</th><th>Dir</th>
              <th>Size</th><th>Stop</th><th>Target</th><th>Status</th><th>Deal Ref</th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((o: any) => (
              <tr key={o.id} className="border-t border-border">
                <td className="p-2">{new Date(o.created_at).toLocaleString()}</td>
                <td className="text-center">{o.epic}</td>
                <td className={`text-center ${o.direction === "BUY" ? "text-bull" : "text-bear"}`}>{o.direction}</td>
                <td className="text-center">{o.size}</td>
                <td className="text-center">{o.stop_loss}</td>
                <td className="text-center">{o.take_profit}</td>
                <td className="text-center">{o.status}</td>
                <td className="text-center text-muted-foreground">{o.deal_reference}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
