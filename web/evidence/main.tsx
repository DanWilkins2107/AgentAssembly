import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { LoginForm } from "../src/LoginForm";

const ERROR = "That email and password do not match.";

const initial = new URLSearchParams(window.location.search).get("state");

export function Harness() {
  const [loading, setLoading] = useState(initial === "loading");
  const [error, setError] = useState(initial === "error" ? ERROR : null);

  function handleSubmit() {
    setError(null);
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setError(ERROR);
    }, 1200);
  }

  return <LoginForm onSubmit={handleSubmit} error={error} loading={loading} />;
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element not found");
}

createRoot(root).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
