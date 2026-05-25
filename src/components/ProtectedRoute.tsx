import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import CrownLoader from "@/components/CrownLoader";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, ageConfirmed, needsOnboarding } = useAuth();
  const loc = useLocation();

  const ageCheckPending = !!user && ageConfirmed === null;
  if (loading || ageCheckPending) {
    return <CrownLoader label="Preparing your throne…" />;
  }

  if (!user) return <Navigate to="/" replace state={{ from: loc }} />;
  if (ageConfirmed === false) return <Navigate to="/verify-age" replace />;
  if (needsOnboarding && loc.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}
