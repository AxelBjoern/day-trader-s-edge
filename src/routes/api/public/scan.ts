import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { runScan } = await import("@/lib/scan.server");
          const result = await runScan();
          return Response.json(result);
        } catch (e: any) {
          return new Response(`Error: ${e?.message ?? "unknown"}`, { status: 500 });
        }
      },
    },
  },
});
