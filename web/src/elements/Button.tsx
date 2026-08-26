import type { ReactNode } from "react";
import "./Button.css";

const VARIANT_CLASS = {
  primary: "button button--primary",
  secondary: "button button--secondary",
};

export type ButtonProps = {
  variant: keyof typeof VARIANT_CLASS;
  type: "button" | "submit";
  loading: boolean;
  loadingLabel: string;
  children: ReactNode;
  onClick?: () => void;
};

export function Button({
  variant,
  type,
  loading,
  loadingLabel,
  children,
  onClick,
}: ButtonProps) {
  return (
    <button
      className={VARIANT_CLASS[variant]}
      type={type}
      onClick={onClick}
      disabled={loading}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}
