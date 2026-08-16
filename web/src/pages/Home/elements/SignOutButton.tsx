import "./SignOutButton.css";

export type SignOutButtonProps = {
  onClick: () => void;
  loading: boolean;
  error: string | null;
};

export function SignOutButton({ onClick, loading, error }: SignOutButtonProps) {
  return (
    <div className="sign-out">
      <button
        className="sign-out__button"
        type="button"
        onClick={onClick}
        disabled={loading}
      >
        {loading ? "Signing out…" : "Sign out"}
      </button>
      {error !== null && (
        <p className="sign-out__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
