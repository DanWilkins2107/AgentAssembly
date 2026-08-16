import { useState } from "react";
import { SignOutButton } from "./elements/SignOutButton";
import { supabase } from "../../elements/supabase/supabase";
import "./page.css";

export function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setError(null);
    setLoading(true);
    const { error: signOutError } = await supabase.auth.signOut();
    setLoading(false);
    setError(signOutError?.message ?? null);
  }

  return (
    <main className="home">
      <span className="home__mark" aria-hidden="true" />
      <h1 className="home__title">AgentAssembly</h1>
      <p className="home__note">Nothing here yet.</p>
      <SignOutButton onClick={handleSignOut} loading={loading} error={error} />
    </main>
  );
}
