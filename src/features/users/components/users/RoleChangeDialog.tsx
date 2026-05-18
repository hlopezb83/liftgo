import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useUpdateRole, type UserRow } from "@/features/users/hooks/useUserManagement";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import type { AppRole } from "@/features/users/hooks/useUserRole";

interface RoleChangeDialogProps {
  target: { user: UserRow; newRole: AppRole } | null;
  onClose: () => void;
}

const renderRoleBadge = (r: AppRole) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[r] ?? ""}`}>
    {ROLE_LABELS[r] || r}
  </span>
);

export function RoleChangeDialog({ target, onClose }: RoleChangeDialogProps) {
  const updateRole = useUpdateRole();

  const handleConfirm = async () => {
    if (!target) return;
    await updateRole.mutateAsync({ userId: target.user.user_id, role: target.newRole });
    onClose();
  };

  return (
    <AlertDialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cambiar rol?</AlertDialogTitle>
          <AlertDialogDescription>
            Se cambiará el rol de <strong>{target?.user.full_name ?? "este usuario"}</strong> de{" "}
            {renderRoleBadge(target?.user.role ?? "dispatcher")} a {renderRoleBadge(target?.newRole ?? "dispatcher")}.
            Esto modificará los permisos de acceso del usuario.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={updateRole.isPending}>
            {updateRole.isPending ? "Actualizando…" : "Confirmar Cambio"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
