import { useEffect, useState } from "react";
import { Lock, LogIn, TrendingUp } from "lucide-react";
import { Button, Card, Input } from "../components/ui";
import { isSupabaseConfigured, supabase } from "../core/supabase";
import { store } from "../core/storage";

// Gates the app behind Supabase email/password auth when configured.
// In local-only mode (no Supabase env) it renders children directly — no login.
export function AuthGate({ children }) {
  // Local-only mode: skip auth entirely so the app runs as before.
  if (!isSupabaseConfigured() || !supabase) {
    return children;
  }
  return <SupabaseGate>{children}</SupabaseGate>;
}

function SupabaseGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [migrated, setMigrated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data?.session ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next ?? null);
    });
    return () => {
      active = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // Run the non-destructive local -> cloud seed once per signed-in session.
  useEffect(() => {
    if (session && !migrated) {
      store.migrateLocalToCloud().finally(() => setMigrated(true));
    }
    if (!session && migrated) setMigrated(false);
  }, [session, migrated]);

  const signIn = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) setError(signInError.message);
    } catch (err) {
      setError(err?.message || "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  if (session === undefined) {
    return <div className="loading">Checking session...</div>;
  }

  if (!session) {
    return (
      <div className="auth-screen">
        <Card className="auth-card">
          <div className="auth-brand">
            <div className="mark">
              <TrendingUp size={22} />
            </div>
            <div>
              <h1>Tracker</h1>
              <span>Sign in to sync your data</span>
            </div>
          </div>
          <form className="auth-form" onSubmit={signIn}>
            <label>
              <span>Email</span>
              <Input
                value={email}
                onChange={setEmail}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              <span>Password</span>
              <Input
                value={password}
                onChange={setPassword}
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                required
              />
            </label>
            {error && (
              <div className="rate-error auth-error">
                <Lock size={13} /> {error}
              </div>
            )}
            <Button variant="primary" type="submit" disabled={busy}>
              <LogIn size={16} /> {busy ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return children;
}

// Sign out helper for the header button.
export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}
