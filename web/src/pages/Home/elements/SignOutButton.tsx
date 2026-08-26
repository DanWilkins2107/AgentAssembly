import { Button } from "../../../elements/Button";
import "./SignOutButton.css";

export type SignOutButtonProps = {
  onClick: () => void;
  loading: boolean;
  error: string | null;
};

export function SignOutButton({ onClick, loading, error }: SignOutButtonProps) {
  return (
    <div className="sign-out">
      <Button
        variant="secondary"
        type="button"
        onClick={onClick}
        loading={loading}
        loadingLabel="Signing out…"
      >
        Sign out
      </Button>
      {error !== null && (
        <p className="sign-out__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
