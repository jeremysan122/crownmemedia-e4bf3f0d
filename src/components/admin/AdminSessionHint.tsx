import { Info } from "lucide-react";

/**
 * Small notice shown on admin pages to remind admins that role changes
 * (granting/revoking admin/moderator) only take effect for a user after
 * they sign out and sign back in (so their JWT is refreshed).
 */
export default function AdminSessionHint() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-foreground/90">
      <Info size={14} className="mt-0.5 text-primary shrink-0" />
      <p>
        <span className="font-bold">Heads up:</span> after granting or revoking
        an admin or moderator role, the affected user must <span className="font-bold">sign out and back in</span> for
        their session to pick up the new permissions.
      </p>
    </div>
  );
}
