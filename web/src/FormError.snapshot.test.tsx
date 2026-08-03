import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormError } from "./FormError";

describe("FormError", () => {
  it("matches snapshot", () => {
    const { container } = render(
      <FormError message="Email or password is incorrect." />,
    );
    expect(container).toMatchSnapshot();
  });
});
