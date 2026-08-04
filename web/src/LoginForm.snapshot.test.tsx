import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  it("matches snapshot", () => {
    const { container } = render(
      <LoginForm onSubmit={() => {}} error={null} loading={false} />,
    );
    expect(container).toMatchSnapshot();
  });
});
