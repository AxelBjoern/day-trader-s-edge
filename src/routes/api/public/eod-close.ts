import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/eod-close")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
        if (!process.env.CRON_SECRET || auth !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { runEodClose } = await import("@/lib/scan.server");
          const result = await runEodClose();
          return Response.json(result);
        } catch (e: any) {
          return new Response(`Error: ${e?.message ?? "unknown"}`, { status: 500 });
        }
      },
    },
  },
});
