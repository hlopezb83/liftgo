import { useEffect, useState } from "react";
import { KeyRound, Eye, EyeOff, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useResetPassword, type UserRow } from "@/features/users/hooks/useUserManagement";

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setPassword("");
      setConfirm("");
      setShow(false);
      setErrorMsg(null);
    }
  }, [user]);

  const handleGenerate = () => {
    const pwd = generatePassword();
    setPassword(pwd);
    setConfirm(pwd);
    setShow(true);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);
    if (password.length < 8) {
      setErrorMsg("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password.length > 72) {
      setErrorMsg("La contraseña no puede exceder 72 caracteres");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Las contraseñas no coinciden");
      return;
    }
    try {
      await resetPassword.mutateAsync({ userId: user.user_id, newPassword: password });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al actualizar contraseña";
      setErrorMsg(msg);
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
                onChange={(e) => { setPassword(e.target.value); setErrorMsg(null); }}
                required
                minLength={8}
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
              onChange={(e) => { setConfirm(e.target.value); setErrorMsg(null); }}
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
