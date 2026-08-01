import type { FormEvent } from "react";
import { Field } from "./Field";
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
      <header className="login-form__header">
        <span className="login-form__mark" aria-hidden="true" />
        <h1 className="login-form__title">Sign in</h1>
        <p className="login-form__subtitle">Welcome back to AgentAssembly.</p>
      </header>

      <div className="login-form__body">
        <Field name="email" label="Email" type="email" autoComplete="email" />
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
        />

        {error && (
          <p className="login-form__error" role="alert">
            {error}
          </p>
        )}

        <button className="login-form__submit" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
