import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { RouteGuard } from "./elements/RouteGuard";
import { Home } from "./pages/Home/page";
import { Login } from "./pages/Login/page";
import "./theme.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element not found");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <RouteGuard requireSession>
              <Home />
            </RouteGuard>
          }
        />
        <Route
          path="/login"
          element={
            <RouteGuard requireSession={false}>
              <Login />
            </RouteGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
