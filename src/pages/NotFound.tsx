import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Route-miss logger. Any URL that reaches this component means the client-side
 * router had no match — we log it to `error_logs` (level=warn, source=route-miss)
 * so we can see which links, especially from Discover, still resolve to 404.
 */
async function logRouteMiss(pathname: string, search: string, referrer: string) {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("error_logs").insert({
      user_id: data?.user?.id ?? undefined,
      message: `route-miss: ${pathname}${search}`,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      source: "route-miss",
      level: "warn",
      metadata: JSON.parse(JSON.stringify({
        pathname,
        search,
        referrer: referrer || undefined,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      })),
    });
  } catch {
    /* never let logging break the 404 screen */
  }
}

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    logRouteMiss(location.pathname, location.search, typeof document !== "undefined" ? document.referrer : "");
  }, [location.pathname, location.search]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted" data-testid="not-found">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <Link to="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
