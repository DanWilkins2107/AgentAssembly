import { expect, it } from "vitest";

const components = Object.keys(import.meta.glob("./**/*.tsx")).filter(
  (path) => !path.endsWith("/main.tsx") && !path.endsWith(".test.tsx"),
);

const snapshots = new Set(Object.keys(import.meta.glob("./**/__snapshots__/*.snap")));

it("every component has a committed snapshot", () => {
  const missing = components
    .map((path) =>
      path.replace(/\/([^/]+)\.tsx$/, "/__snapshots__/$1.snapshot.test.tsx.snap"),
    )
    .filter((snapshot) => !snapshots.has(snapshot));

  expect(missing).toEqual([]);
});
