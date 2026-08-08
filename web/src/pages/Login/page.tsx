import { useState } from "react";
import { LoginForm } from "./elements/LoginForm/LoginForm";
import { supabase } from "./elements/supabase/supabase";

export function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(email: string, password: string) {
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    setError(signInError?.message ?? null);
  }

  return <LoginForm onSubmit={handleSubmit} error={error} loading={loading} />;
}
