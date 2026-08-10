import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { useSetPasswordForm } from "../../hooks/useSetPasswordForm";
import type { UserRow } from "../../hooks/useUserManagement";

interface Props {
  user: UserRow | null;
  onClose: () => void;
}

function describeUser(user: UserRow | null): string {
  if (!user) return "Usuario";
  const name = user.full_name ?? user.email ?? "Usuario";
  const suffix = user.email && user.full_name ? ` — ${user.email}` : "";
  return `${name}${suffix}`;
}

export function SetPasswordDialog({ user, onClose }: Props) {
  const { errorMsg, isPending, handleGenerateLink } = useSetPasswordForm(user, onClose);

  return (
    <FormDialog
      isPending={isPending}
      open={!!user}
      onOpenChange={(v) => !v && onClose()}
      title="Generar enlace de recuperación"
      width="md"
      description={describeUser(user)}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Se generará un enlace de recuperación de un solo uso. El usuario deberá usarlo para definir su propia contraseña. Sus sesiones activas se cerrarán.
        </p>
        {errorMsg && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMsg}
          </div>
        )}
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={isPending} onClick={handleGenerateLink}>
            {isPending ? "Generando…" : "Generar enlace de recuperación"}
          </Button>
        </FormDialogFooter>
      </div>
    </FormDialog>
  );
}
