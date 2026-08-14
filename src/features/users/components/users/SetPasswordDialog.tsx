import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
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
  const { errorMsg, recoveryLink, isPending, handleGenerateLink, handleClose } =
    useSetPasswordForm(user, onClose);

  return (
    <FormDialog
      isPending={isPending}
      open={!!user}
      onOpenChange={(v) => !v && handleClose()}
      title="Generar enlace de recuperación"
      width="md"
      description={describeUser(user)}
    >
      <div className="space-y-4">
        {recoveryLink ? (
          <>
            <p className="text-sm text-muted-foreground">
              Comparte este enlace de un solo uso con el usuario. No se volverá a mostrar; si lo pierdes, deberás generar uno nuevo.
            </p>
            <div className="rounded-md border bg-muted/50 p-3">
              <p className="break-all font-mono text-xs">{recoveryLink}</p>
            </div>
            <FormDialogFooter>
              <Button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(recoveryLink).catch(() => undefined);
                }}
              >
                Copiar enlace
              </Button>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cerrar
              </Button>
            </FormDialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Se generará un enlace de recuperación de un solo uso. El usuario deberá usarlo para definir su propia contraseña. Sus sesiones activas se cerrarán.
            </p>
            {errorMsg && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {errorMsg}
              </div>
            )}
            <FormDialogFooter>
              <FormDialogCancelButton onCancel={handleClose} disabled={isPending} />
              <Button type="button" disabled={isPending} onClick={handleGenerateLink}>
                {isPending ? "Generando…" : "Generar enlace de recuperación"}
              </Button>
            </FormDialogFooter>
          </>
        )}
      </div>
    </FormDialog>
  );
}
