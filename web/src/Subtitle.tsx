import type { ReactNode } from "react";
import "./Subtitle.css";

export function Subtitle({ children }: { children: ReactNode }) {
  return <p className="subtitle">{children}</p>;
}
