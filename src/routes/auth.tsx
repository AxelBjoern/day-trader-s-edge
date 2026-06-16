import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — VDNX Trading" }] }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/dashboard" },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (e: any) {
      setErr(e.message ?? "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-md border border-border bg-card p-6 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">vdnx</div>
          <h1 className="mt-1 text-xl font-bold">
            {mode === "signup" ? "Create account" : "Sign in"}
          </h1>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Email</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Password</label>
          <input
            type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        {err && <div className="text-sm text-bear">{err}</div>}
        <button
          type="submit" disabled={loading}
          className="w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? "..." : mode === "signup" ? "Create account" : "Sign in"}
        </button>
        <button
          type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
        <p className="text-[10px] text-muted-foreground text-center">
          First user becomes admin automatically.
        </p>
      </form>
    </div>
  );
}
