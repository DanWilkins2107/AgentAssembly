import type { FormEvent } from "react";
import { Button } from "../../../../elements/Button";
import { Field } from "./elements/Field";
import { FormError } from "./elements/FormError";
import { Subtitle } from "./elements/Subtitle";
import { Title } from "./elements/Title";
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
        <Title>Sign in</Title>
        <Subtitle>Welcome back to AgentAssembly.</Subtitle>
      </header>

      <div className="login-form__body">
        <Field name="email" label="Email" type="email" autoComplete="email" />
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
        />
        <FormError message={error} />
        <Button
          variant="primary"
          type="submit"
          loading={loading}
          loadingLabel="Signing in…"
        >
          Sign in
        </Button>
      </div>
    </form>
  );
}
