import { ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import type { AppRole } from "@/features/users/hooks/useUserRole";

export function RoleBadge({ role }: { role: AppRole }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[role] ?? ""}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}
