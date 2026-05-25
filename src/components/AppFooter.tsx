import { Link } from "react-router-dom";


/**
 * Persistent in-app footer linking to the Legal Center, Reports/Appeals,
 * and key policies. Rendered inside AppShell at the bottom of the main
 * scroll area on all pages (above the mobile BottomNav).
 */
export default function AppFooter() {
  return (
    <footer className="border-t border-border/40 bg-background/60 backdrop-blur px-4 pt-5 pb-6 mt-auto">
      <div className="w-full space-y-3 text-center">
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          <Link to="/legal" className="hover:text-foreground underline-offset-2 hover:underline font-semibold text-foreground/80">
            Legal Center
          </Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/conduct" className="hover:text-foreground">Community</Link>
          <Link to="/cookies" className="hover:text-foreground">Cookies</Link>
          <Link to="/dmca" className="hover:text-foreground">DMCA</Link>
          <Link to="/csae-policy" className="hover:text-foreground">Child Safety</Link>
          <Link to="/reports/mine" className="hover:text-foreground">My Reports</Link>
          <Link to="/contact-legal" className="hover:text-foreground">Contact</Link>
        </nav>
        <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
          © {new Date().getFullYear()} CrownMe Media. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
