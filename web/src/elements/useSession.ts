import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./supabase/supabase";

export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      settled = true;
      setSession(next);
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (settled) return;
      settled = true;
      setSession(data.session);
      setLoading(false);
    });

    return () => {
      settled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
