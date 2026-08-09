import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { useSession } from "./useSession";
import { supabase } from "./supabase/supabase";

vi.mock("./supabase/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
  },
}));

const getSession = supabase.auth.getSession as unknown as Mock;
const onAuthStateChange = supabase.auth.onAuthStateChange as unknown as Mock;
const unsubscribe = vi.fn();

const sessionOf = (id: string) => ({ user: { id } }) as unknown as Session;

let emit: (event: AuthChangeEvent, session: Session | null) => void;

beforeEach(() => {
  getSession.mockReset();
  onAuthStateChange.mockReset();
  unsubscribe.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
  onAuthStateChange.mockImplementation((callback) => {
    emit = callback;
    return { data: { subscription: { unsubscribe } } };
  });
});

afterEach(cleanup);

describe("useSession", () => {
  it("resolves the session already stored on mount", async () => {
    const stored = sessionOf("stored");
    getSession.mockResolvedValue({ data: { session: stored } });

    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBe(stored);
  });

  it("resolves to no session when nothing is stored", async () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it("drops a getSession result that lands after an auth event", async () => {
    let resolveGetSession!: (result: unknown) => void;
    getSession.mockReturnValue(
      new Promise((resolve) => {
        resolveGetSession = resolve;
      }),
    );
    const fromEvent = sessionOf("from-event");

    const { result } = renderHook(() => useSession());
    act(() => emit("SIGNED_IN", fromEvent));

    await act(async () => {
      resolveGetSession({ data: { session: sessionOf("stale") } });
    });

    expect(result.current.session).toBe(fromEvent);
    expect(result.current.loading).toBe(false);
  });

  it("swaps in the session from TOKEN_REFRESHED", async () => {
    const initial = sessionOf("initial");
    getSession.mockResolvedValue({ data: { session: initial } });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.session).toBe(initial));

    const refreshed = sessionOf("refreshed");
    act(() => emit("TOKEN_REFRESHED", refreshed));

    expect(result.current.session).toBe(refreshed);
  });

  it("clears the session on SIGNED_OUT without refetching", async () => {
    getSession.mockResolvedValue({ data: { session: sessionOf("initial") } });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => emit("SIGNED_OUT", null));

    expect(result.current.session).toBeNull();
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", async () => {
    const { result, unmount } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
