import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./Field";

describe("Field", () => {
  it("matches snapshot", () => {
    const { container } = render(
      <Field name="email" label="Email" type="email" autoComplete="email" />,
    );
    expect(container).toMatchSnapshot();
  });
});
