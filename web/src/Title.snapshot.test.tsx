import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Title } from "./Title";

describe("Title", () => {
  it("matches snapshot", () => {
    const { container } = render(<Title>Sign in</Title>);
    expect(container).toMatchSnapshot();
  });
});
