// Reusable empty-state panel for list/grid surfaces.
import type { ReactNode } from "react";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon, title, description, action, className = "" }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`royal-card p-8 text-center mt-6 mx-3 lg:mx-0 ${className}`}
    >
      {icon && (
        <div className="size-12 mx-auto mb-3 rounded-full bg-muted/40 text-muted-foreground flex items-center justify-center">
          {icon}
        </div>
      )}
      <p className="font-display text-foreground text-lg mb-1">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="flex items-center justify-center">{action}</div>}
    </div>
  );
}
