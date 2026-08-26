import { useState } from "react";
import type { AuthError } from "@supabase/supabase-js";

export function useAuthAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ error: AuthError | null }>) {
    setError(null);
    setLoading(true);
    const { error: actionError } = await action();
    setLoading(false);
    setError(actionError?.message ?? null);
  }

  return { loading, error, run };
}
