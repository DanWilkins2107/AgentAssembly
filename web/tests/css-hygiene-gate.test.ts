import { expect, it } from "vitest";

const CSS_IMPORT = /import\s+(?:[^"';]*?from\s*)?["']([^"']+\.css)["']/g;
const CLASS = /\.[A-Za-z_-][\w-]*/g;
const STRING_LITERAL = /"[^"\n]*"|'[^'\n]*'|`[^`]*`/g;

const THEME_IMPORTER = "src/main.tsx";

const siblingOf = (path: string) =>
  `./${(path.split("/").at(-1) ?? "").replace(/\.tsx?$/, "")}.css`;

const strayCssImportsIn = (path: string, source: string) =>
  [...source.matchAll(CSS_IMPORT)]
    .map(([, specifier]) => specifier ?? "")
    .filter(
      (specifier) =>
        specifier !== siblingOf(path) &&
        !(path === THEME_IMPORTER && specifier === "./theme.css"),
    );

const declaredClassesIn = (source: string) => {
  const names: string[] = [];
  const inDeclarations: boolean[] = [];
  let prelude = "";

  for (const char of source) {
    if (char === "{") {
      const isSelector = !prelude.trimStart().startsWith("@");
      if (isSelector && !inDeclarations.at(-1))
        names.push(
          ...(prelude.match(CLASS) ?? []).map((match) => match.slice(1)),
        );
      inDeclarations.push(isSelector);
      prelude = "";
    } else if (char === "}") {
      inDeclarations.pop();
      prelude = "";
    } else if (char === ";") {
      prelude = "";
    } else {
      prelude += char;
    }
  }

  return [...new Set(names)];
};

const usedTokensIn = (source: string) =>
  (source.match(STRING_LITERAL) ?? []).flatMap((literal) =>
    literal.slice(1, -1).split(/\s+/).filter(Boolean),
  );

const sources = Object.entries(
  import.meta.glob("../src/**/*.{css,ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
).map(([key, source]) => [key.replace("../", ""), source] as const);

const stylesheets = sources.filter(([path]) => path.endsWith(".css"));
const modules = sources.filter(
  ([path]) => !path.endsWith(".css") && !path.includes(".test."),
);
const components = modules.filter(([path]) => path.endsWith(".tsx"));

const usedTokens = new Set(
  components.flatMap(([, source]) => usedTokensIn(source)),
);

it("a module imports only its own stylesheet", () => {
  const violations = modules.flatMap(([path, source]) =>
    strayCssImportsIn(path, source).map(
      (specifier) => `${path} — ${specifier}`,
    ),
  );

  expect(violations).toEqual([]);
});

it("every declared classname is used", () => {
  const violations = stylesheets.flatMap(([path, source]) =>
    declaredClassesIn(source)
      .filter((name) => !usedTokens.has(name))
      .map((name) => `${path} — .${name}`),
  );

  expect(violations).toEqual([]);
});

it("stylesheets reach the gate as raw source", () => {
  expect(
    stylesheets.flatMap(([, source]) => declaredClassesIn(source)).length,
  ).toBeGreaterThan(0);
  expect(usedTokens.size).toBeGreaterThan(0);
});

it("the import check allows the sibling stylesheet only", () => {
  const page = "src/pages/Home/page.tsx";
  expect(strayCssImportsIn(page, 'import "./page.css";')).toEqual([]);
  expect(strayCssImportsIn(THEME_IMPORTER, 'import "./theme.css";')).toEqual(
    [],
  );
  expect(strayCssImportsIn(page, 'import "../Other/Other.css";')).toEqual([
    "../Other/Other.css",
  ]);
  expect(strayCssImportsIn(page, 'import "./theme.css";')).toEqual([
    "./theme.css",
  ]);
});

it("the classname check reads selectors, not declaration bodies", () => {
  expect(
    declaredClassesIn(".foo:hover { gap: 0.5rem; background: url(./a.png) }"),
  ).toEqual(["foo"]);
  expect(
    declaredClassesIn("@media (width > 20rem) { .bar { gap: 0; } }"),
  ).toEqual(["bar"]);
  expect(declaredClassesIn('@import "./x.css";')).toEqual([]);
  expect(usedTokensIn('<p className="foo bar" />')).toEqual(["foo", "bar"]);
});
