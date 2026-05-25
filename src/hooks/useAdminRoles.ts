import { useEffect, useState } from "react";
import { getMyAdminRoles, type AdminRole } from "@/lib/admin";

const RESOLVE_ROLES: AdminRole[] = ["admin", "super_admin", "content_admin", "support_admin", "moderator"];
const BAN_ROLES: AdminRole[] = ["admin", "super_admin", "content_admin"];
const FREEZE_ROLES: AdminRole[] = ["admin", "super_admin", "finance_admin"];
const SUSPEND_ROLES: AdminRole[] = ["admin", "super_admin", "content_admin", "moderator"];

export function useAdminRoles() {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    getMyAdminRoles()
      .then((r) => { if (alive) { setRoles(r); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); }); // prevent perpetual spinner on DB error
    return () => { alive = false; };
  }, []);
  const has = (list: AdminRole[]) => roles.some((r) => list.includes(r));
  return {
    roles,
    loading,
    canResolveReports: has(RESOLVE_ROLES),
    canDismissReports: has(RESOLVE_ROLES),
    canBan: has(BAN_ROLES),
    canSuspend: has(SUSPEND_ROLES),
    canFreezePayouts: has(FREEZE_ROLES),
    canMarkPaid: has(FREEZE_ROLES),
  };
}
