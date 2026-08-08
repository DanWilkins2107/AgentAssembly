import { expect, it } from "vitest";

const RELATIVE_IMPORT = /(?:from|import\s*\()\s*["'](\.[^"']*)["']/g;

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

it("every element sits at the lowest common folder of its consumers", () => {
  const violations = Object.keys(sources).flatMap((path) => {
    const declared = declaredOwnerOf(path);
    if (declared === null) return [];

    const consumers = consumersByModule.get(path) ?? [];
    if (consumers.length === 0) return [`${path} — no consumers`];

    const expected = lowestCommonFolder(consumers.map(consumerOwnerOf));
    if (declared === expected) return [];
    return [`${path} — owner is ${declared}, expected ${expected}`];
  });

  expect(violations).toEqual([]);
});
