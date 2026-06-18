import { Navigate, useLocation, useParams } from "react-router-dom";

/**
 * Permanent client-side redirect from legacy /u/:username to the short
 * root-level /:username profile URL. Preserves search params and hash so
 * shared links with ?post=... or #section continue to work.
 */
export default function UsernameRedirect() {
  const { username } = useParams();
  const loc = useLocation();
  if (!username) return <Navigate to="/" replace />;
  return <Navigate to={`/${username}${loc.search}${loc.hash}`} replace />;
}
