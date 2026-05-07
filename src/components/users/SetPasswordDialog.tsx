import { useEffect, useState } from "react";
import { KeyRound, Eye, EyeOff, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useResetPassword, type UserRow } from "@/hooks/useUserManagement";

interface Props {
  user: UserRow | null;
  onClose: () => void;
}

function generatePassword(length = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => charset[v % charset.length]).join("");
}

export function SetPasswordDialog({ user, onClose }: Props) {
  const resetPassword = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (user) {
      setPassword("");
      setConfirm("");
      setShow(false);
    }
  }, [user]);

  const handleGenerate = () => {
    const pwd = generatePassword();
    setPassword(pwd);
    setConfirm(pwd);
    setShow(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (password.length > 72) {
      toast.error("La contraseña no puede exceder 72 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    try {
      await resetPassword.mutateAsync({ userId: user.user_id, newPassword: password });
      onClose();
    } catch {
      // toast handled by hook
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Asignar nueva contraseña
          </DialogTitle>
          <DialogDescription>
            {user?.full_name ?? user?.email ?? "Usuario"}
            {user?.email && user?.full_name ? ` — ${user.email}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="set-password">Nueva contraseña</Label>
            <div className="relative">
              <Input
                id="set-password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                maxLength={72}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                aria-label={show ? "Ocultar" : "Mostrar"}
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar contraseña</Label>
            <Input
              id="confirm-password"
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              maxLength={72}
              autoComplete="new-password"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleGenerate} className="w-full">
            <Sparkles className="h-4 w-4 mr-2" />
            Generar contraseña segura
          </Button>
          <p className="text-xs text-muted-foreground">
            Comparte la nueva contraseña con el usuario por un canal seguro. No se enviará por correo automáticamente.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={resetPassword.isPending}>
              {resetPassword.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
