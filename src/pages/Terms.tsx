import { Navigate } from "react-router-dom";

// Legacy stub. The real Terms of Service now lives at /terms (TermsOfService.tsx).
// Kept for backward compatibility with any direct imports of "@/pages/Terms".
export default function Terms() {
  return <Navigate to="/terms" replace />;
}
