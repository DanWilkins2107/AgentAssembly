import { mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openAccessLog } from "./access-log.js";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "proxy-log-"));
  path = join(dir, "access.log");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("openAccessLog", () => {
  it("appends every line to the same file", () => {
    const log = openAccessLog(path);
    log.write("one\n");
    log.write("two\n");
    log.close();

    expect(readFileSync(path, "utf8")).toBe("one\ntwo\n");
  });

  it("keeps writing to the rotated-away file until it is told to reopen", () => {
    const log = openAccessLog(path);
    log.write("before\n");
    renameSync(path, `${path}.1`);
    log.write("still the old file\n");
    log.reopen();
    log.write("after\n");
    log.close();

    expect(readFileSync(`${path}.1`, "utf8")).toBe(
      "before\nstill the old file\n",
    );
    expect(readFileSync(path, "utf8")).toBe("after\n");
  });

  it("releases the descriptor on close", () => {
    const log = openAccessLog(path);
    log.close();

    expect(() => log.write("late\n")).toThrow();
  });
});
