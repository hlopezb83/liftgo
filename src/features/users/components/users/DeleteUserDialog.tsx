import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDeleteUser, type UserRow } from "../../hooks/useUserManagement";

interface DeleteUserDialogProps {
  user: UserRow | null;
  onClose: () => void;
}

export function DeleteUserDialog({ user, onClose }: DeleteUserDialogProps) {
  const deleteUser = useDeleteUser();

  const handleDelete = async () => {
    if (!user) return;
    await deleteUser.mutateAsync(user.user_id);
    onClose();
  };

  return (
    <ConfirmDialog
      open={!!user}
      onOpenChange={(v) => !v && onClose()}
      title="¿Eliminar usuario?"
      descriptionNode={
        <span>
          Se eliminará permanentemente a <strong>{user?.full_name ?? "este usuario"}</strong> y su cuenta de acceso. Esta acción no se puede deshacer.
        </span>
      }
      confirmLabel="Eliminar"
      destructive
      loading={deleteUser.isPending}
      onConfirm={handleDelete}
    />
  );
}
