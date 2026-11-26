import { useId, useState, type FormEvent as ReactFormEvent } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { PasswordVisibilityToggle } from "@/components/forms/PasswordVisibilityToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const { updatePassword } = useAuth();
  const baseId = useId();
  const newPasswordId = `${baseId}-new-password`;
  const newPasswordHintId = `${baseId}-new-password-hint`;
  const confirmPasswordId = `${baseId}-confirm-password`;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Al cerrar sin guardar se limpian los campos (antes solo se limpiaban en éxito).
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPassword("");
      setConfirm("");
      setShowPassword(false);
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: ReactFormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      notifyValidation({ message: "La contraseña debe tener al menos 8 caracteres" });
      return;
    }
    if (password !== confirm) {
      notifyValidation({ message: "Las contraseñas no coinciden" });
      return;
    }
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) {
      notifyError({ title: "Error al cambiar contraseña", error: error });
    } else {
      notifySuccess("Contraseña actualizada");
      setPassword("");
      setConfirm("");
      setShowPassword(false);
      onOpenChange(false);
    }
  };

  return (
    <FormDialog
      isPending={loading}
      open={open}
      onOpenChange={handleOpenChange}
      title="Cambiar contraseña"
      width="sm"
      description="Ingresa tu nueva contraseña."
    >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={newPasswordId}>Nueva contraseña</Label>
            <div className="relative">
              <Input
                id={newPasswordId}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                aria-describedby={newPasswordHintId}
                className="pr-10"
              />
              <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            </div>
            <p id={newPasswordHintId} className="text-xs text-muted-foreground">
              Mínimo 8 caracteres.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={confirmPasswordId}>Confirmar contraseña</Label>
            <Input
              id={confirmPasswordId}
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <FormDialogFooter>
            <FormDialogCancelButton onCancel={() => handleOpenChange(false)} disabled={loading} />
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando…" : "Guardar"}
            </Button>
          </FormDialogFooter>
        </form>
    </FormDialog>
  );
}
