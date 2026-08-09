import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Login } from "./page";

describe("Login", () => {
  it("matches snapshot", () => {
    const { container } = render(<Login />);
    expect(container).toMatchSnapshot();
  });
});
