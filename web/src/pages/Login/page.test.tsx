import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { Login } from "./page";
import { supabase } from "./elements/supabase";

vi.mock("./elements/supabase", () => ({
  supabase: { auth: { signInWithPassword: vi.fn() } },
}));

const signInWithPassword = supabase.auth.signInWithPassword as unknown as Mock;

beforeEach(() => {
  signInWithPassword.mockReset();
});

afterEach(cleanup);

function submit(email = "ada@example.com", password = "hunter2") {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button"));
}

describe("Login", () => {
  it("signs in with the entered credentials", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    render(<Login />);

    submit();

    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "hunter2",
      }),
    );
  });

  it("shows the message from a failed sign-in", async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    render(<Login />);

    submit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Invalid login credentials");
  });

  it("clears the previous error when submitting again", async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    render(<Login />);
    submit();
    await screen.findByRole("alert");

    signInWithPassword.mockResolvedValue({ error: null });
    submit();

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("disables submit while the sign-in is pending", async () => {
    let finish!: (result: unknown) => void;
    signInWithPassword.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<Login />);

    submit();

    const pending = await screen.findByRole("button", { name: "Signing in…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);

    finish({ error: null });
    await screen.findByRole("button", { name: "Sign in" });
  });
});
