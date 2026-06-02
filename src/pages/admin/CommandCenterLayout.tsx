import { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import AppShell from "@/components/AppShell";
import {
  LayoutDashboard,
  Activity,
  ShieldAlert,
  DollarSign,
  Users,
  Flag,
  Megaphone,
  Settings as SettingsIcon,
  ScrollText,
  LifeBuoy,
  Stethoscope,
  Bug,
  ToggleRight,
  HeartPulse,
  DollarSign as Wallet2,
} from "lucide-react";

const NAV: Array<{ to: string; label: string; icon: ReactNode }> = [
  { to: "/admin/command-center", label: "Overview", icon: <LayoutDashboard size={14} /> },
  { to: "/admin/command-center/realtime", label: "Real-time", icon: <Activity size={14} /> },
  { to: "/admin/command-center/security", label: "Security", icon: <ShieldAlert size={14} /> },
  { to: "/admin/command-center/finance", label: "Finance", icon: <DollarSign size={14} /> },
  { to: "/admin/command-center/stripe-health", label: "Stripe Health", icon: <Stethoscope size={14} /> },
  { to: "/admin/command-center/db-health", label: "DB Health", icon: <HeartPulse size={14} /> },
  { to: "/admin/command-center/error-logs", label: "Error Logs", icon: <Bug size={14} /> },
  { to: "/admin/command-center/feature-flags", label: "Feature Flags", icon: <ToggleRight size={14} /> },
  { to: "/admin/command-center/users", label: "Users", icon: <Users size={14} /> },
  { to: "/admin/command-center/content", label: "Content", icon: <Flag size={14} /> },
  { to: "/admin/command-center/reports", label: "Reports", icon: <Flag size={14} /> },
  { to: "/admin/command-center/broadcasts", label: "Broadcasts", icon: <Megaphone size={14} /> },
  { to: "/admin/command-center/support", label: "Support", icon: <LifeBuoy size={14} /> },
  { to: "/admin/command-center/settings", label: "Settings", icon: <SettingsIcon size={14} /> },
  { to: "/admin/command-center/audit", label: "Audit", icon: <ScrollText size={14} /> },
];

export default function CommandCenterLayout() {
  return (
    <AppShell title="COMMAND CENTER">
      <div className="px-3 py-3 space-y-3">
        <nav className="overflow-x-auto -mx-3 px-3">
          <div className="flex gap-1.5 min-w-max">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/admin/command-center"}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider border transition-colors ${
                    isActive
                      ? "bg-gold/15 border-gold/40 text-gold"
                      : "border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`
                }
              >
                {n.icon} {n.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="pb-12">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
