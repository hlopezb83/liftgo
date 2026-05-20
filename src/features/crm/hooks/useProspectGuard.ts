import { useUserRole } from "@/features/users/hooks/useUserRole";
import { toast } from "sonner";

/**
 * Centralizes the "Cerrado Ganado" stage permission rule for prospects.
 * Returns helpers to check and to assert (with a toast side-effect) the
 * permission before mutating a prospect into that stage.
 */
export function useProspectGuard() {
  const { data: role } = useUserRole();
  const canCloseDeal = role === "admin" || role === "administrativo";

  const assertCanClose = (action: "move" | "create" | "save"): boolean => {
    if (canCloseDeal) return true;
    const descriptions: Record<typeof action, string> = {
      move: "Solo usuarios administrativos pueden mover prospectos a Cerrado Ganado",
      create: "Solo usuarios administrativos pueden crear prospectos en Cerrado Ganado",
      save: "Solo usuarios administrativos pueden guardar prospectos en Cerrado Ganado",
    };
    toast.error("Acceso restringido", {
      description: descriptions[action],
    });
    return false;
  };

  return { canCloseDeal, assertCanClose };
}
