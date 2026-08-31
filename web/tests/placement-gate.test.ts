import { expect, it } from "vitest";

const ROOT_FILES = ["main.tsx", "theme.css", "vite-env.d.ts"];
const NAME = String.raw`[\w-]+`;
const EXT = String.raw`(?:tsx|ts|css|test\.ts|test\.tsx|snapshot\.test\.tsx)`;
const SNAP = String.raw`snapshot\.test\.tsx\.snap`;

const IS_NAME = new RegExp(`^${NAME}$`);
const LEAF = new RegExp(
  String.raw`^elements/(?:${NAME}\.${EXT}|__snapshots__/${NAME}\.${SNAP})$`,
);
const companionOf = (base: string) =>
  new RegExp(String.raw`^(?:${base}\.${EXT}|__snapshots__/${base}\.${SNAP})$`);

type Placement = { base: string; rest: string[] };

const opensFolder = (parts: string[], dir: string) => {
  const [top = "", name = ""] = parts;
  return parts.length > 2 && top === dir && IS_NAME.test(name);
};

const peelPage = (parts: string[]): Placement =>
  opensFolder(parts, "pages")
    ? { base: "page", rest: parts.slice(2) }
    : { base: "", rest: parts };

const peelElements = ({ base, rest }: Placement): Placement => {
  const [, name = ""] = rest;
  if (!opensFolder(rest, "elements") || name === "__snapshots__")
    return { base, rest };
  return peelElements({ base: name, rest: rest.slice(2) });
};

const isPlaced = (path: string) => {
  const parts = path.split("/");
  if (parts.length === 1) return ROOT_FILES.includes(path);

  const { base, rest } = peelElements(peelPage(parts));
  const tail = rest.join("/");
  return LEAF.test(tail) || (base !== "" && companionOf(base).test(tail));
};

const modules = Object.keys(import.meta.glob("../src/**/*")).map((key) =>
  key.replace("../src/", ""),
);

it("every module sits in a page folder or an elements folder", () => {
  expect(modules.length).toBeGreaterThan(0);
  expect(modules.filter((path) => !isPlaced(path))).toEqual([]);
});

it("the placement check flags misplaced modules", () => {
  expect(isPlaced("pages/Home/page.tsx")).toBe(true);
  expect(isPlaced("pages/Home/elements/Foo.tsx")).toBe(true);
  expect(isPlaced("pages/Home/elements/Foo/Foo.tsx")).toBe(true);
  expect(isPlaced("elements/useThing.test.ts")).toBe(true);
  expect(isPlaced("pages/Home/stray.tsx")).toBe(false);
  expect(isPlaced("pages/Home/elements/Foo/Bar.tsx")).toBe(false);
  expect(isPlaced("components/Button.tsx")).toBe(false);
  expect(isPlaced("stray.ts")).toBe(false);
});
