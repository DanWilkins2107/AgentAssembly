import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

afterEach(cleanup);

function renderForm(props: Partial<Parameters<typeof LoginForm>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <LoginForm onSubmit={onSubmit} error={null} loading={false} {...props} />,
  );
  return onSubmit;
}

describe("LoginForm", () => {
  it("submits the entered email and password", () => {
    const onSubmit = renderForm();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSubmit).toHaveBeenCalledWith("a@b.com", "hunter2");
  });

  it("shows the error when one is given", () => {
    renderForm({ error: "Invalid credentials" });

    expect(screen.getByRole("alert").textContent).toBe("Invalid credentials");
  });

  it("shows no alert without an error", () => {
    renderForm();

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("disables submit while loading", () => {
    renderForm({ loading: true });

    const button = screen.getByRole("button", { name: "Signing in…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
