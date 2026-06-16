import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VDNX Trading — IG CFD Day Trader" },
      { name: "description", content: "Automated IG CFD day trading for Nasdaq, FX and BTC with AI-validated signals." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-24">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          vdnx // ig cfd auto-trader
        </div>
        <h1 className="mt-4 text-5xl font-bold tracking-tight">
          Realized-P&L risk-controlled
          <br />
          <span className="text-primary">day trading agent.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-muted-foreground">
          Scans Nasdaq, EUR/USD, GBP/USD and BTC every 5 minutes during the EST session.
          DeepSeek-validated signals, hard daily loss cap, force-close at 16:55 EST.
        </p>
        <div className="mt-10 flex gap-3">
          <Link
            to="/dashboard"
            className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Enter dashboard →
          </Link>
          <Link
            to="/auth"
            className="rounded-md border border-border px-6 py-3 text-sm font-semibold hover:bg-secondary"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            ["5-min scan", "IG REST snapshots + 30×1m candles"],
            ["DeepSeek V4 Pro", "Two-pass scan + validation via OpenRouter"],
            ["Hard risk cap", "2% per trade, 5% daily, EOD flat"],
          ].map(([h, p]) => (
            <div key={h} className="rounded-md border border-border bg-card p-4">
              <div className="text-sm font-semibold text-primary">{h}</div>
              <div className="mt-1 text-xs text-muted-foreground">{p}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
