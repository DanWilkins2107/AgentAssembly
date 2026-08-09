import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./supabase/supabase";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;

    const settle = (next: Session | null) => {
      settled = true;
      setSession(next);
      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      settle(nextSession);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (settled) return;
      settle(data.session);
    });

    return () => {
      settled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
