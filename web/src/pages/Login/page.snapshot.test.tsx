import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Login } from "./page";

vi.mock("./elements/supabase/supabase", () => ({
  supabase: { auth: { signInWithPassword: vi.fn() } },
}));

describe("Login", () => {
  it("matches snapshot", () => {
    const { container } = render(<Login />);
    expect(container).toMatchSnapshot();
  });
});
