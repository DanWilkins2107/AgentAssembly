import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Subtitle } from "./Subtitle";

describe("Subtitle", () => {
  it("matches snapshot", () => {
    const { container } = render(
      <Subtitle>Welcome back to AgentAssembly.</Subtitle>,
    );
    expect(container).toMatchSnapshot();
  });
});
