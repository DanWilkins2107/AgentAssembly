import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignOutButton } from "./SignOutButton";

describe("SignOutButton", () => {
  it("matches snapshot", () => {
    const { container } = render(
      <SignOutButton onClick={() => {}} loading={false} error={null} />,
    );
    expect(container).toMatchSnapshot();
  });
});
