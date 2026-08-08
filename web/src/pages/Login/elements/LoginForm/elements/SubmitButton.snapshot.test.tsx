import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SubmitButton } from "./SubmitButton";

describe("SubmitButton", () => {
  it("matches snapshot", () => {
    const { container } = render(
      <SubmitButton loading={false} loadingLabel="Signing in…">
        Sign in
      </SubmitButton>,
    );
    expect(container).toMatchSnapshot();
  });
});
