import { expect, it } from "vitest";

const NAMED_COLOURS =
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(
    " ",
  );

const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-f])/gi;
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)?/gi;
const NAMED = new RegExp(
  `(?<![\\w-])(?:${NAMED_COLOURS.join("|")})(?![\\w-])`,
  "gi",
);

const valueSide = (line: string) => {
  const colon = line.indexOf(":");
  return colon === -1 ? "" : line.slice(colon + 1);
};

const colourLiteralsIn = (path: string, source: string) =>
  source.split("\n").flatMap((line) => [
    ...(line.match(HEX) ?? []),
    ...(line.match(COLOUR_FUNCTION) ?? []),
    ...(path.endsWith(".css") ? (valueSide(line).match(NAMED) ?? []) : []),
  ]);

const THEME = "src/theme.css";

const sources = new Map(
  Object.entries(
    import.meta.glob("../src/**/*.{css,ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>,
  ).map(([key, source]) => [key.replace("../", ""), source] as const),
);

it("colour literals live only in theme.css", () => {
  const violations = [...sources]
    .filter(([path]) => path !== THEME)
    .flatMap(([path, source]) =>
      colourLiteralsIn(path, source).map(
        (literal) => `${path} — ${literal.trim()}`,
      ),
    );

  expect(violations).toEqual([]);
});

it("css files reach the gate as raw source", () => {
  expect(colourLiteralsIn(THEME, sources.get(THEME) ?? "")).not.toEqual([]);
});

it("the detector flags colour literals and leaves vars and class names alone", () => {
  expect(colourLiteralsIn("a.css", "  color: #fff;")).toEqual(["#fff"]);
  expect(colourLiteralsIn("a.css", "  background: rgb(0 0 0);")).toEqual([
    "rgb(0 0 0)",
  ]);
  expect(colourLiteralsIn("a.css", "  color: red;")).toEqual(["red"]);
  expect(colourLiteralsIn("a.css", "  color: var(--accent);")).toEqual([]);
  expect(colourLiteralsIn("a.css", ".red-banner {")).toEqual([]);
});
