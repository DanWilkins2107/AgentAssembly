import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const TODO = /TODO.*/g;
const SHAPE = /^TODO [0-9a-fA-F]{8} (\d{4}-\d{2}-\d{2}): \S/;
const MALFORMED =
  'does not match "TODO <8-hex node> <YYYY-MM-DD>: description"';

const LOCKFILE = /(^|\/)package-lock\.json$/;
const MAX_TODO_DAYS = 30;
const DAY_MS = 86_400_000;

const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;

// Date.parse rolls 2026-02-30 over to 2026-03-02 rather than rejecting it.
const isRealDate = (date: string) => {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return (
    !Number.isNaN(parsed) && new Date(parsed).toISOString().startsWith(date)
  );
};

const windowProblem = (days: number, expires: string) => {
  if (days < 0) return `expired on ${expires}`;
  if (days > MAX_TODO_DAYS)
    return `expires ${expires}, more than ${MAX_TODO_DAYS} days out`;
  return null;
};

const expiryProblem = (expires: string, today: string) =>
  isRealDate(expires)
    ? windowProblem(daysBetween(today, expires), expires)
    : `expiry "${expires}" is not a real date`;

const todoProblem = (todo: string, today: string) => {
  const [, expires] = SHAPE.exec(todo) ?? [];
  return expires === undefined ? MALFORMED : expiryProblem(expires, today);
};

const problemsIn = (path: string, text: string, today: string) =>
  (text.match(TODO) ?? []).flatMap((todo) => {
    const problem = todoProblem(todo.trimEnd(), today);
    return problem === null ? [] : [`${path} — ${problem}`];
  });

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const gatePath = fileURLToPath(import.meta.url).replaceAll("\\", "/");

const sources = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean)
  .filter((path) => !LOCKFILE.test(path) && !gatePath.endsWith(`/${path}`))
  .map((path) => [path, readFileSync(join(root, path), "utf8")] as const);

it("every TODO in the repo names a node and an unexpired date", () => {
  const today = new Date().toISOString().slice(0, 10);

  expect(
    sources.flatMap(([path, text]) => problemsIn(path, text, today)),
  ).toEqual([]);
});

it("the sweep reads tracked files from the repo root", () => {
  const pkg = sources.find(([path]) => path === "cli/package.json");

  expect(pkg?.[1]).toContain("agentassembly-cli");
});

it("the scanner reads each TODO to the end of its line", () => {
  const text = [
    "-- TODO 8c320d4b 2025-01-01: rotted",
    "select 1;",
    "-- TODO 8c320d4b 2026-01-10: fine",
    "",
  ].join("\n");

  expect(problemsIn("a.sql", text, "2026-01-01")).toEqual([
    "a.sql — expired on 2025-01-01",
  ]);
});

it("the check passes a well-formed unexpired TODO and fails the rest", () => {
  const check = (todo: string) => todoProblem(todo, "2026-01-01");

  expect(check("TODO 8c320d4b 2026-01-01: expires today")).toBeNull();
  expect(check("TODO 8C320D4B 2026-01-31: last allowed day")).toBeNull();

  expect(check("TODO: no node, no date")).toEqual(MALFORMED);
  expect(check("TODO 8c320d4b: no date")).toEqual(MALFORMED);
  expect(check("TODO 8c320d4 2026-01-10: seven hex")).toEqual(MALFORMED);
  expect(check("TODO 8c320d4z 2026-01-10: not hex")).toEqual(MALFORMED);
  expect(check("TODO 8c320d4b 10/01/2026: wrong date shape")).toEqual(
    MALFORMED,
  );
  expect(check("TODO 8c320d4b 2026-01-10:")).toEqual(MALFORMED);

  expect(check("TODO 8c320d4b 2026-02-30: rolls over")).toContain(
    "not a real date",
  );
  expect(check("TODO 8c320d4b 2026-13-01: unparseable")).toContain(
    "not a real date",
  );
  expect(check("TODO 8c320d4b 2025-12-31: stale")).toContain("expired on");
  expect(check("TODO 8c320d4b 2026-02-01: distant")).toContain(
    "more than 30 days out",
  );
});
