import { expect, it } from "vitest";

const RELATIVE_IMPORT = /(?:from|import\s*\()\s*["'](\.[^"']*)["']/g;

type TemporaryExclude = {
  path: string;
  node: string;
  expires: string;
  reason: string;
};

const TEMPORARY_EXCLUDES: TemporaryExclude[] = [];

const NODE_ID = /^[0-9a-f]{8}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EXCLUDE_DAYS = 5;
const DAY_MS = 86_400_000;

const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;

const expiryProblems = (entry: TemporaryExclude, today: string) => {
  if (!ISO_DATE.test(entry.expires))
    return [`${entry.path} — expires "${entry.expires}" is not YYYY-MM-DD`];

  const days = daysBetween(today, entry.expires);
  if (Number.isNaN(days))
    return [`${entry.path} — expires "${entry.expires}" is not a real date`];
  if (days < 0) return [`${entry.path} — expired on ${entry.expires}`];
  if (days > MAX_EXCLUDE_DAYS)
    return [
      `${entry.path} — expires ${entry.expires}, more than ${MAX_EXCLUDE_DAYS} days out`,
    ];
  return [];
};

const excludeProblems = (
  entry: TemporaryExclude,
  today: string,
  modules: Map<string, string[]>,
) => {
  const problems = [...expiryProblems(entry, today)];
  if (!NODE_ID.test(entry.node))
    problems.push(`${entry.path} — node "${entry.node}" is not 8 hex digits`);

  const consumers = modules.get(entry.path);
  if (consumers === undefined)
    problems.push(`${entry.path} — no such module, drop the exclude`);
  else if (consumers.length > 0)
    problems.push(`${entry.path} — has consumers now, drop the exclude`);

  return problems;
};

const sources: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob("../src/**/*.{ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>,
  )
    .map(([key, source]) => [key.replace("../", ""), source] as const)
    .filter(([path]) => !path.includes(".test.")),
);

const folderOf = (path: string) => path.slice(0, path.lastIndexOf("/"));

const consumerOwnerOf = (consumer: string) => {
  const folder = folderOf(consumer);
  return folder.endsWith("/elements") ? folderOf(folder) : folder;
};

const declaredOwnerOf = (path: string) => {
  const index = path.lastIndexOf("/elements/");
  return index === -1 ? null : path.slice(0, index);
};

const resolveImport = (fromFolder: string, specifier: string) => {
  const segments: string[] = [];
  for (const segment of [...fromFolder.split("/"), ...specifier.split("/")]) {
    if (segment === "..") segments.pop();
    else if (segment !== ".") segments.push(segment);
  }
  const base = segments.join("/");
  return [`${base}.ts`, `${base}.tsx`].find((candidate) => candidate in sources);
};

const lowestCommonFolder = (folders: string[]) => {
  const split = folders.map((folder) => folder.split("/"));
  const [first = []] = split;
  let shared = first.length;
  for (const other of split) {
    let index = 0;
    while (index < shared && other[index] === first[index]) index += 1;
    shared = index;
  }
  return first.slice(0, shared).join("/");
};

// src/pages owns no elements folder of its own — the placement gate rejects
// src/pages/elements — so anything shared across pages lives in src/elements.
const expectedOwnerOf = (consumers: string[]) => {
  const folder = lowestCommonFolder(consumers.map(consumerOwnerOf));
  return folder === "src/pages" ? "src" : folder;
};

const violationsFor = (
  path: string,
  consumers: string[],
  excluded: Set<string>,
) => {
  const declared = declaredOwnerOf(path);
  if (declared === null) return [];

  if (consumers.length === 0)
    return excluded.has(path) ? [] : [`${path} — no consumers`];

  const expected = expectedOwnerOf(consumers);
  if (declared === expected) return [];
  return [`${path} — owner is ${declared}, expected ${expected}`];
};

const consumersByModule = new Map<string, string[]>();
for (const [path, source] of Object.entries(sources)) {
  for (const [, specifier] of source.matchAll(RELATIVE_IMPORT)) {
    const target = resolveImport(folderOf(path), specifier ?? "");
    if (target === undefined || target === path) continue;
    consumersByModule.set(target, [
      ...(consumersByModule.get(target) ?? []),
      path,
    ]);
  }
}

const modules = new Map(
  Object.keys(sources).map(
    (path) => [path, consumersByModule.get(path) ?? []] as const,
  ),
);

const excludedPaths = new Set(TEMPORARY_EXCLUDES.map((entry) => entry.path));

it("every element sits at the lowest common folder of its consumers", () => {
  const violations = Object.keys(sources).flatMap((path) =>
    violationsFor(path, consumersByModule.get(path) ?? [], excludedPaths),
  );

  expect(violations).toEqual([]);
});

it("a cross-page element is owned by src, not src/pages", () => {
  const crossPage = ["src/pages/Home/page.tsx", "src/pages/Login/page.tsx"];
  const withinHome = [
    "src/pages/Home/page.tsx",
    "src/pages/Home/elements/Foo/Foo.tsx",
  ];

  expect(expectedOwnerOf(crossPage)).toBe("src");
  expect(expectedOwnerOf(withinHome)).toBe("src/pages/Home");
  expect(
    violationsFor("src/elements/useAuthAction.ts", crossPage, new Set()),
  ).toEqual([]);
  expect(
    violationsFor("src/pages/elements/useAuthAction.ts", crossPage, new Set()),
  ).toHaveLength(1);
});

it("an exclude suppresses the no-consumers rule for its path alone", () => {
  const path = "src/pages/Home/elements/useSession.ts";
  const excluded = new Set([path]);

  expect(violationsFor(path, [], excluded)).toEqual([]);
  expect(violationsFor(path, [], new Set())).toHaveLength(1);
  expect(
    violationsFor(path, ["src/pages/Other/page.tsx"], excluded),
  ).toHaveLength(1);
  expect(
    violationsFor("src/pages/elements/Widget.ts", [], excluded),
  ).toHaveLength(1);
});

it("every temporary exclude names a node, expires soon and is still needed", () => {
  const today = new Date().toISOString().slice(0, 10);

  expect(
    TEMPORARY_EXCLUDES.flatMap((entry) =>
      excludeProblems(entry, today, modules),
    ),
  ).toEqual([]);
});

it("the exclude check flags rotten entries and passes sound ones", () => {
  const tree = new Map([
    ["src/pages/Home/elements/useSession.ts", []],
    ["src/pages/Home/elements/Used.ts", ["src/pages/Home/page.tsx"]],
  ]);
  const check = (over: Partial<TemporaryExclude>) =>
    excludeProblems(
      {
        path: "src/pages/Home/elements/useSession.ts",
        node: "44f5c73e",
        expires: "2026-01-03",
        reason: "consumer route guard lands next",
        ...over,
      },
      "2026-01-01",
      tree,
    );

  expect(check({})).toEqual([]);
  expect(check({ expires: "2026-01-01" })).toEqual([]);
  expect(check({ expires: "2026-01-06" })).toEqual([]);

  expect(check({ node: "44f5c73" })).toHaveLength(1);
  expect(check({ node: "44f5c73z" })).toHaveLength(1);
  expect(check({ expires: "2025-12-31" })).toHaveLength(1);
  expect(check({ expires: "2026-01-07" })).toHaveLength(1);
  expect(check({ expires: "03/01/2026" })).toHaveLength(1);
  expect(check({ expires: "2026-02-30" })).toHaveLength(1);
  expect(check({ path: "src/pages/Home/elements/Gone.ts" })).toHaveLength(1);
  expect(check({ path: "src/pages/Home/elements/Used.ts" })).toHaveLength(1);
});
