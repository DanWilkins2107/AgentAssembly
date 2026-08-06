import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Login } from "./pages/Login/page";
import "./theme.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element not found");
}

createRoot(root).render(
  <StrictMode>
    <Login />
  </StrictMode>,
);
