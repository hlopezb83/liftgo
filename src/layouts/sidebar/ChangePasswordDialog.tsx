import { useState } from "react";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      notifyValidation({ message: "La contraseña debe tener al menos 6 caracteres" });
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
      open={open}
      onOpenChange={onOpenChange}
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
              minLength={6}
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
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Guardar"}
            </Button>
          </FormDialogFooter>
        </form>
    </FormDialog>
  );
}
