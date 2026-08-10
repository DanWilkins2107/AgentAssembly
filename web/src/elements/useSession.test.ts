import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
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

const sessionFor = (token: string) =>
  ({ access_token: token, user: { id: "ada" } }) as unknown as Session;

let emit: (event: AuthChangeEvent, session: Session | null) => void;

beforeEach(() => {
  getSession.mockReset();
  onAuthStateChange.mockReset();
  unsubscribe.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
  onAuthStateChange.mockImplementation((callback: typeof emit) => {
    emit = callback;
    return { data: { subscription: { unsubscribe } } };
  });
});

afterEach(cleanup);

describe("useSession", () => {
  it("exposes the session already stored on mount", async () => {
    const stored = sessionFor("stored");
    getSession.mockResolvedValue({ data: { session: stored } });

    const { result } = renderHook(() => useSession());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBe(stored);
  });

  it("settles to no session when nothing is stored", async () => {
    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it("swaps in the rotated session on TOKEN_REFRESHED", async () => {
    getSession.mockResolvedValue({ data: { session: sessionFor("first") } });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const rotated = sessionFor("rotated");
    act(() => emit("TOKEN_REFRESHED", rotated));

    expect(result.current.session).toBe(rotated);
  });

  it("drops the stored session when a refresh is rejected", async () => {
    getSession.mockResolvedValue({ data: { session: sessionFor("revoked") } });
    const { result } = renderHook(() => useSession());

    act(() => emit("SIGNED_OUT", null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", async () => {
    const { result, unmount } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
