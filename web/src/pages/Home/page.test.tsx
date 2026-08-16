import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { Home } from "./page";
import { supabase } from "../../elements/supabase/supabase";

vi.mock("../../elements/supabase/supabase", () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

const signOut = supabase.auth.signOut as unknown as Mock;

beforeEach(() => {
  signOut.mockReset();
});

afterEach(cleanup);

describe("Home", () => {
  it("signs out once per click", async () => {
    signOut.mockResolvedValue({ error: null });
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it("shows the message from a failed sign-out", async () => {
    signOut.mockResolvedValue({ error: { message: "Network error" } });
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Network error");
  });

  it("disables the button while the sign-out is pending", async () => {
    let finish!: (result: unknown) => void;
    signOut.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    const pending = await screen.findByRole("button", { name: "Signing out…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);

    finish({ error: null });
    await screen.findByRole("button", { name: "Sign out" });
  });
});
