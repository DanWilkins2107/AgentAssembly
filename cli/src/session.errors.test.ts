import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSession,
  getSession,
  sessionDir,
  SessionError,
  setSession,
  type SessionBundle,
} from "./session.js";

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
    const failure = getSession("/store");
    await expect(failure).rejects.toBeInstanceOf(SessionError);
    await expect(failure).rejects.toThrow(/failed to read/);
  });

  it("names the error and keeps the underlying fs error as its cause", async () => {
    const cause = nonMissing();
    vi.mocked(readFile).mockRejectedValue(cause);
    const error = (await getSession("/store").catch((thrown: unknown) => thrown)) as SessionError;
    expect(error.name).toBe("SessionError");
    expect(error.cause).toBe(cause);
  });

  it("wraps a non-ENOENT unlink failure on clear in SessionError", async () => {
    vi.mocked(unlink).mockRejectedValue(nonMissing());
    const failure = clearSession("/store");
    await expect(failure).rejects.toBeInstanceOf(SessionError);
    await expect(failure).rejects.toThrow(/failed to remove/);
  });

  it("removes the temp file and wraps a rename failure in SessionError", async () => {
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(open).mockResolvedValue(fakeHandle() as never);
    vi.mocked(rename).mockRejectedValue(nonMissing());
    vi.mocked(unlink).mockRejectedValue(nonMissing());
    const failure = setSession(session, "/store");
    await expect(failure).rejects.toBeInstanceOf(SessionError);
    await expect(failure).rejects.toThrow(/failed to write/);
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it("reads from the default store when no dir is given", async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(session));
    await expect(getSession()).resolves.toEqual(session);
    expect(readFile).toHaveBeenCalledWith(join(sessionDir(), "session.json"), "utf8");
  });

  it("writes to the default store when no dir is given", async () => {
    const handle = fakeHandle();
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(open).mockResolvedValue(handle as never);
    vi.mocked(rename).mockResolvedValue(undefined);
    await expect(setSession(session)).resolves.toBeUndefined();
    expect(handle.writeFile).toHaveBeenCalledWith(JSON.stringify(session), "utf8");
    expect(handle.close).toHaveBeenCalled();
  });

  it("clears the default store when no dir is given", async () => {
    vi.mocked(unlink).mockResolvedValue(undefined);
    await expect(clearSession()).resolves.toBeUndefined();
  });
});
