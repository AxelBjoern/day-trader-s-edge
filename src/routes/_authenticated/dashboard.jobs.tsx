import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getJobRuns } from "@/lib/trading.functions";

export const Route = createFileRoute("/_authenticated/dashboard/jobs")({
  component: Jobs,
});

function Jobs() {
  const fetchRuns = useServerFn(getJobRuns);
  const [job, setJob] = useState<string>("");

  const q = useQuery({
    queryKey: ["job-runs", job],
    queryFn: () => fetchRuns({ data: { job: job || undefined, limit: 200 } }),
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Job runs</h1>
        <select value={job} onChange={(e) => setJob(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1 text-sm">
          <option value="">All jobs</option>
          <option value="scan">scan</option>
          <option value="eod_close">eod_close</option>
        </select>
      </div>

      <div className="rounded-md border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left p-2">Started</th>
              <th>Job</th><th>Status</th><th>Duration</th>
              <th className="text-left p-2">Summary / Error</th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="p-2">{new Date(r.started_at).toLocaleString()}</td>
                <td className="text-center">{r.job_name}</td>
                <td className="text-center">
                  <span className={`rounded px-2 py-0.5 ${
                    r.status === "success" ? "bg-bull/20 text-bull" :
                    r.status === "error" ? "bg-bear/20 text-bear" :
                    r.status === "skipped" ? "bg-muted text-muted-foreground" :
                    "bg-primary/20 text-primary"
                  }`}>{r.status}</span>
                </td>
                <td className="text-center">{r.duration_ms ? `${r.duration_ms}ms` : "—"}</td>
                <td className="p-2 font-mono text-[10px] text-muted-foreground break-all">
                  {r.error ?? (r.summary ? JSON.stringify(r.summary).slice(0, 300) : "—")}
                </td>
              </tr>
            ))}
            {(q.data ?? []).length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No runs yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
