import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useSession } from "./useSession";

export type RouteGuardProps = {
  requireSession: boolean;
  children: ReactNode;
};

export function RouteGuard({ requireSession, children }: RouteGuardProps) {
  const { session, loading } = useSession();

  if (loading) return null;
  if (Boolean(session) === requireSession) return children;
  return <Navigate to={requireSession ? "/login" : "/"} replace />;
}
