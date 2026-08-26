import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("matches snapshot", () => {
    const { container } = render(
      <Button variant="primary" type="submit" loading={false} loadingLabel="…">
        Sign in
      </Button>,
    );
    expect(container).toMatchSnapshot();
  });

  it("matches snapshot while loading", () => {
    const { container } = render(
      <Button
        variant="quiet"
        type="button"
        loading
        loadingLabel="Signing out…"
        onClick={() => {}}
      >
        Sign out
      </Button>,
    );
    expect(container).toMatchSnapshot();
  });
});
