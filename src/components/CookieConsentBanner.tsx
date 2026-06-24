import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "cm:cookie-consent:v1";

type Choice = "accepted" | "rejected";

export function getCookieConsent(): Choice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getCookieConsent() === null) setVisible(true);
  }, []);

  const decide = (choice: Choice) => {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
      window.dispatchEvent(new CustomEvent("cm:cookie-consent", { detail: choice }));
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur-md sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground/90">
            We use essential cookies to run CrownMe and optional analytics cookies to improve it.
            Read our{" "}
            <Link to="/cookies" className="underline underline-offset-2 hover:text-foreground">
              Cookie Policy
            </Link>
            .
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => decide("rejected")}>
              Reject non-essential
            </Button>
            <Button size="sm" onClick={() => decide("accepted")}>
              Accept all
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
