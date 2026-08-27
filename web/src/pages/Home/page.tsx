import { SignOutButton } from "./elements/SignOutButton";
import { supabase } from "../../elements/supabase/supabase";
import { useAuthAction } from "../../elements/useAuthAction";
import "./page.css";

export function Home() {
  const { loading, error, run } = useAuthAction();

  return (
    <main className="home">
      <span className="home__mark" aria-hidden="true" />
      <h1 className="home__title">AgentAssembly</h1>
      <p className="home__note">Nothing here yet.</p>
      <SignOutButton
        onClick={() => void run(() => supabase.auth.signOut())}
        loading={loading}
        error={error}
      />
    </main>
  );
}
