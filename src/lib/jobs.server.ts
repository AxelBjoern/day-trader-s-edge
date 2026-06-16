// Job run recorder. Wraps a job fn and persists a job_runs row.
export async function recordJobRun<T>(
  jobName: string,
  fn: () => Promise<T>,
  meta?: { dryRun?: boolean }
): Promise<T> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const started = Date.now();
  const { data: row } = await supabaseAdmin
    .from("job_runs")
    .insert({ job_name: jobName, status: "running", summary: meta ?? null })
    .select("id").single();
  const id = (row as any)?.id;
  try {
    const result = await fn();
    const status = (result as any)?.skipped_reason ? "skipped" : "success";
    await supabaseAdmin.from("job_runs").update({
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      status,
      summary: { ...(meta ?? {}), result } as any,
    }).eq("id", id);
    return result;
  } catch (e: any) {
    await supabaseAdmin.from("job_runs").update({
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      status: "error",
      error: e?.message ?? String(e),
      summary: meta ?? null,
    }).eq("id", id);
    throw e;
  }
}
