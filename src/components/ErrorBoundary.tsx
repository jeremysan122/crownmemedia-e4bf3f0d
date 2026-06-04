import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const RELOAD_FLAG = "crownme:chunk-reload-at";

/**
 * Detects the family of errors that happen when the browser holds a stale
 * reference to a lazy-loaded JS chunk after a redeploy. In that case we
 * hard-reload (once) so the user gets the fresh asset graph instead of a
 * permanent "Something went wrong" screen.
 */
function isStaleChunkError(error: Error | null): boolean {
  if (!error) return false;
  const msg = `${error.name || ""} ${error.message || ""}`.toLowerCase();
  return (
    msg.includes("importing a module script failed") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("chunkloaderror") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("unexpected token '<'") // index.html served instead of JS
  );
}

/**
 * Top-level error boundary — catches any React render error and shows a
 * graceful recovery screen instead of a white blank page.
 * Wrap around <App /> in main.tsx.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);

    if (isStaleChunkError(error)) {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_FLAG) || "0");
        const now = Date.now();
        // Only auto-reload if we haven't tried within the last 30s (avoid loops).
        if (now - last > 30_000) {
          sessionStorage.setItem(RELOAD_FLAG, String(now));
          // Best-effort: clear service worker caches so the new chunk hash resolves.
          if ("caches" in window) {
            caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
          }
          if ("serviceWorker" in navigator) {
            navigator.serviceWorker.getRegistrations().then((regs) =>
              Promise.all(regs.map((r) => r.update().catch(() => undefined))),
            ).catch(() => {});
          }
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    }
  }

  handleReload = () => {
    try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // While the auto-reload is in flight for a stale chunk, show a lightweight
      // refreshing screen instead of the scary error message.
      if (isStaleChunkError(this.state.error)) {
        return (
          <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background text-foreground text-center gap-4">
            <div className="text-4xl animate-pulse">👑</div>
            <p className="text-sm text-muted-foreground">Updating CrownMe…</p>
          </div>
        );
      }
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background text-foreground text-center gap-6">
          <div className="text-5xl">👑</div>
          <div>
            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-muted-foreground text-sm max-w-xs">
              CrownMe hit an unexpected error. This has been reported. Try refreshing the page.
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="px-6 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Reload app
          </button>
          {import.meta.env.DEV && this.state.error && (
            <pre className="text-left text-xs text-destructive bg-muted p-4 rounded-lg max-w-lg overflow-auto">
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// Also catch chunk-load failures that happen outside React's render path
// (e.g. inside React.lazy's Suspense resolver, or async route loaders).
if (typeof window !== "undefined") {
  const tryReload = (err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err ?? ""));
    if (!isStaleChunkError(error)) return;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_FLAG) || "0");
      const now = Date.now();
      if (now - last > 30_000) {
        sessionStorage.setItem(RELOAD_FLAG, String(now));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  };
  window.addEventListener("error", (e) => tryReload(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => tryReload(e.reason));
}
