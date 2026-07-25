import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSession, getSession, SessionError, setSession, type SessionBundle } from "./session.js";

vi.mock("node:fs/promises");

const session: SessionBundle = {
  access_token: "access-token-value",
  refresh_token: "refresh-token-value",
};

function nonMissing(): NodeJS.ErrnoException {
  const error = new Error("boom") as NodeJS.ErrnoException;
  error.code = "EACCES";
  return error;
}

function fakeHandle() {
  return {
    writeFile: vi.fn().mockResolvedValue(undefined),
    sync: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("session fs failures", () => {
  it("wraps a non-ENOENT read failure in SessionError", async () => {
    vi.mocked(readFile).mockRejectedValue(nonMissing());
    await expect(getSession("/store")).rejects.toBeInstanceOf(SessionError);
  });

  it("wraps a non-ENOENT unlink failure on clear in SessionError", async () => {
    vi.mocked(unlink).mockRejectedValue(nonMissing());
    await expect(clearSession("/store")).rejects.toBeInstanceOf(SessionError);
  });

  it("removes the temp file and wraps a rename failure in SessionError", async () => {
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(open).mockResolvedValue(fakeHandle() as never);
    vi.mocked(rename).mockRejectedValue(nonMissing());
    vi.mocked(unlink).mockRejectedValue(nonMissing());
    await expect(setSession(session, "/store")).rejects.toBeInstanceOf(SessionError);
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it("reads from the default store when no dir is given", async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(session));
    await expect(getSession()).resolves.toEqual(session);
  });

  it("writes to the default store when no dir is given", async () => {
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(open).mockResolvedValue(fakeHandle() as never);
    vi.mocked(rename).mockResolvedValue(undefined);
    await expect(setSession(session)).resolves.toBeUndefined();
  });

  it("clears the default store when no dir is given", async () => {
    vi.mocked(unlink).mockResolvedValue(undefined);
    await expect(clearSession()).resolves.toBeUndefined();
  });
});
