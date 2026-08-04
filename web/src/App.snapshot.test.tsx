import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./supabase", () => ({
  supabase: { auth: { signInWithPassword: vi.fn() } },
}));

describe("App", () => {
  it("matches snapshot", () => {
    const { container } = render(<App />);
    expect(container).toMatchSnapshot();
  });
});
