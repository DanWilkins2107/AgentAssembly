import { cleanup, render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { RouteGuard } from "./RouteGuard";
import { useSession } from "./useSession";

vi.mock("./useSession", () => ({ useSession: vi.fn() }));

const mockedUseSession = useSession as unknown as Mock;

const session = { access_token: "token" } as unknown as Session;

const renderGuard = (requireSession: boolean) => {
  const guarded = requireSession ? "/" : "/login";
  const target = requireSession ? "/login" : "/";

  return render(
    <MemoryRouter initialEntries={[guarded]}>
      <Routes>
        <Route
          path={guarded}
          element={
            <RouteGuard requireSession={requireSession}>
              <p>protected</p>
            </RouteGuard>
          }
        />
        <Route path={target} element={<p>{`landed on ${target}`}</p>} />
      </Routes>
    </MemoryRouter>,
  );
};

beforeEach(() => mockedUseSession.mockReset());
afterEach(cleanup);

describe("RouteGuard", () => {
  it("renders neither children nor a redirect while the session is unknown", () => {
    mockedUseSession.mockReturnValue({ session: null, loading: true });

    const { container } = renderGuard(true);

    expect(container.innerHTML).toBe("");
  });

  it("renders children on a protected route with a session", () => {
    mockedUseSession.mockReturnValue({ session, loading: false });

    renderGuard(true);

    expect(screen.getByText("protected")).toBeTruthy();
  });

  it("redirects to /login on a protected route without a session", () => {
    mockedUseSession.mockReturnValue({ session: null, loading: false });

    renderGuard(true);

    expect(screen.getByText("landed on /login")).toBeTruthy();
  });

  it("renders children on a public route without a session", () => {
    mockedUseSession.mockReturnValue({ session: null, loading: false });

    renderGuard(false);

    expect(screen.getByText("protected")).toBeTruthy();
  });

  it("redirects to / on a public route with a session", () => {
    mockedUseSession.mockReturnValue({ session, loading: false });

    renderGuard(false);

    expect(screen.getByText("landed on /")).toBeTruthy();
  });
});
