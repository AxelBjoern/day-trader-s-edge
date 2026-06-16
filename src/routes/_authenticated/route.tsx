import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  const router = useRouter();
  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-sm font-bold tracking-[0.3em]">VDNX</Link>
            <nav className="flex items-center gap-4 text-xs uppercase tracking-wider text-muted-foreground">
              <Link to="/dashboard" activeProps={{ className: "text-primary" }}>Dashboard</Link>
              <Link to="/dashboard/signals" activeProps={{ className: "text-primary" }}>Signals</Link>
              <Link to="/dashboard/orders" activeProps={{ className: "text-primary" }}>Orders</Link>
              <Link to="/dashboard/settings" activeProps={{ className: "text-primary" }}>Settings</Link>
              <Link to="/dashboard/logs" activeProps={{ className: "text-primary" }}>Logs</Link>
            </nav>
          </div>
          <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground">
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
