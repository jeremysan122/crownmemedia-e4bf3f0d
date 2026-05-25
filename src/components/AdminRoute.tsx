import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/**
 * Defense-in-depth role gate. RLS already protects every admin mutation;
 * this prevents the admin UI from rendering at all for non-moderators.
 * Always wrap inside <ProtectedRoute> so user/profile/role state is loaded
 * before this component runs.
 */
export default function AdminRoute({ children }: { children: ReactNode }) {
  const { loading, isModerator, profile } = useAuth();

  // ProtectedRoute already waited for auth, but the role lookup completes
  // alongside profile load. Block rendering until that has settled.
  if (loading || profile === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="size-12 rounded-full crown-ring" />
      </div>
    );
  }

  if (!isModerator) return <Navigate to="/feed" replace />;
  return <>{children}</>;
}
