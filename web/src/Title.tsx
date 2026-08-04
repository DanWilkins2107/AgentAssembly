import type { ReactNode } from "react";
import "./Title.css";

export function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="title">
      <span className="title__mark" aria-hidden="true" />
      {children}
    </h1>
  );
}
