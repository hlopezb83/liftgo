import { ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import type { AppRole } from "../../hooks/useUserRole";

interface Props {
  role: AppRole | null;
}

/**
 * Bloque 5.2 (R4): cuando `role` es null (fila sin `user_roles`) mostramos
 * un badge de advertencia "Sin rol" en vez de inventar "dispatcher".
 * Así el admin identifica la anomalía y puede asignar el rol correcto.
 */
export function RoleBadge({ role }: Props) {
  if (!role) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/30"
        title="Este usuario no tiene rol asignado. Asigna uno desde el diálogo de rol."
      >
        Sin rol
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[role] ?? ""}`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}
