import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { RouteGuard } from "./RouteGuard";

vi.mock("./useSession", () => ({
  useSession: () => ({ session: null, loading: false }),
}));

describe("RouteGuard", () => {
  it("matches snapshot", () => {
    const { container } = render(
      <MemoryRouter>
        <RouteGuard requireSession={false}>
          <p>protected</p>
        </RouteGuard>
      </MemoryRouter>,
    );

    expect(container).toMatchSnapshot();
  });
});
