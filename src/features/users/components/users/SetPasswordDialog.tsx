import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { ViewIcon, HideIcon, Sparkles } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const {
    password, confirm, show, errorMsg, isPending,
    onPasswordChange, onConfirmChange, toggleShow,
    handleGenerate, handleSubmit,
  } = useSetPasswordForm(user, onClose);

  return (
    <FormDialog
      open={!!user}
      onOpenChange={(v) => !v && onClose()}
      title="Asignar nueva contraseña"
      width="md"
      description={describeUser(user)}
    >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="set-password">Nueva contraseña</Label>
            <div className="relative">
              <Input
                id="set-password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                aria-label={show ? "Ocultar" : "Mostrar"}
                onClick={toggleShow}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {show ? <HideIcon className="h-4 w-4" /> : <ViewIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar contraseña</Label>
            <Input
              id="confirm-password"
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => onConfirmChange(e.target.value)}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleGenerate} className="w-full">
            <Sparkles className="h-4 w-4 mr-2" />
            Generar contraseña segura
          </Button>
          {errorMsg && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMsg}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Mínimo 8 caracteres. Evita secuencias comunes (<code>1234567890</code>, <code>qwerty</code>, fechas o nombres) aunque incluyan símbolos — son rechazadas por la política de filtraciones (HIBP). Lo más seguro es pulsar <strong>Generar contraseña segura</strong>. Comparte la contraseña por un canal seguro.
          </p>
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </FormDialogFooter>
        </form>
    </FormDialog>
  );
}
