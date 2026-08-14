import { useState, type FormEvent as ReactFormEvent } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
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
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // Al cerrar sin guardar se limpian los campos (antes solo se limpiaban en éxito).
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPassword("");
      setConfirm("");
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
      notifySuccess("Contraseña actualizada correctamente");
      setPassword("");
      setConfirm("");
      onOpenChange(false);
    }
  };

  return (
    <FormDialog
      isPending={loading}
      open={open}
      onOpenChange={handleOpenChange}
      title="Cambiar Contraseña"
      width="sm"
      description="Ingresa tu nueva contraseña."
    >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nueva contraseña</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar contraseña</Label>
            <Input
              id="confirm-password"
              type="password"
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
