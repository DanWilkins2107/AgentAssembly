import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("matches snapshot", () => {
    const { container } = render(<App />);
    expect(container).toMatchSnapshot();
  });
});
