import type { ReactNode } from "react";
import "./SubmitButton.css";

export type SubmitButtonProps = {
  loading: boolean;
  loadingLabel: string;
  children: ReactNode;
};

export function SubmitButton({
  loading,
  loadingLabel,
  children,
}: SubmitButtonProps) {
  return (
    <button className="submit-button" type="submit" disabled={loading}>
      {loading ? loadingLabel : children}
    </button>
  );
}
