import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/eod-close")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        // gate=true → only fires at 16:55 America/New_York (DST-aware)
        // force=true → bypass gate + idempotency
        const url = new URL(request.url);
        const force = url.searchParams.get("force") === "1";
        try {
          const { runEodClose } = await import("@/lib/scan.server");
          const { recordJobRun } = await import("@/lib/jobs.server");
          const result = await recordJobRun("eod_close", () => runEodClose({ gate: !force, force }));
          return Response.json(result);
        } catch (e: any) {
          return new Response(`Error: ${e?.message ?? "unknown"}`, { status: 500 });
        }
      },
    },
  },
});
