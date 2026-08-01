import type { FormEvent } from "react";
import "./LoginForm.css";

export type LoginFormProps = {
  onSubmit: (email: string, password: string) => void;
  error: string | null;
  loading: boolean;
};

export function LoginForm({ onSubmit, error, loading }: LoginFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit(String(data.get("email")), String(data.get("password")));
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <h1 className="login-form__title">Sign in</h1>

      <label className="login-form__field" htmlFor="login-email">
        Email
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </label>

      <label className="login-form__field" htmlFor="login-password">
        Password
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>

      {error === null ? null : (
        <p className="login-form__error" role="alert">
          {error}
        </p>
      )}

      <button className="login-form__submit" type="submit" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
