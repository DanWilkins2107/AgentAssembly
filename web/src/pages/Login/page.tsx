import { LoginForm } from "./elements/LoginForm/LoginForm";
import { supabase } from "../../elements/supabase/supabase";
import { useAuthAction } from "../../elements/useAuthAction";

export function Login() {
  const { loading, error, run } = useAuthAction();

  return (
    <LoginForm
      onSubmit={(email, password) =>
        void run(() => supabase.auth.signInWithPassword({ email, password }))
      }
      error={error}
      loading={loading}
    />
  );
}
