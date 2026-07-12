import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import { useUpdateRole, type UserRow } from "../../hooks/useUserManagement";
import type { AppRole } from "../../hooks/useUserRole";

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
    <ConfirmDialog
      open={!!target}
      onOpenChange={(v) => !v && onClose()}
      title="¿Cambiar rol?"
      descriptionNode={
        <span>
          Se cambiará el rol de <strong>{target?.user.full_name ?? "este usuario"}</strong> de{" "}
          {renderRoleBadge(target?.user.role ?? "dispatcher")} a {renderRoleBadge(target?.newRole ?? "dispatcher")}.
          Esto modificará los permisos de acceso del usuario.
        </span>
      }
      confirmLabel="Confirmar Cambio"
      loading={updateRole.isPending}
      onConfirm={handleConfirm}
    />
  );
}
