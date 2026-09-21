import { useRef, useState } from "react";
import { z } from "zod";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { UserPlus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAFF_ROLES, ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import { useInviteUser } from "../../hooks/useUserManagement";
import type { AppRole } from "../../hooks/useUserRole";

// v7.226.0 · E2E-N7: validar email antes de invocar la edge function.
const inviteEmailSchema = z.string().trim().email("Ingresa un correo válido");

// SEC-B5: contraseña inicial opcional; misma regla que valida el servidor.
const PASSWORD_HINT =
  "La contraseña debe tener 12-72 caracteres e incluir mayúsculas, minúsculas, números y símbolos.";
const invitePasswordSchema = z
  .string()
  .min(12)
  .max(72)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/)
  .regex(/[^A-Za-z0-9]/);

interface InviteUserDialogProps {
  onCreated: () => void;
  /**
   * Control externo opcional del estado abierto (p. ej. el CTA del EmptyState
   * de la página). Sin estas props el diálogo se auto-gestiona, como antes.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function InviteUserDialog({ onCreated, open: openProp, onOpenChange }: InviteUserDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<string>("dispatcher");
  const inviteUser = useInviteUser();

  const renderRoleBadge = (r: AppRole) => (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[r] ?? ""}`}>
      {ROLE_LABELS[r] || r}
    </span>
  );

  const handleInvite = async () => {
    if (!fullName.trim()) return;
    const parsed = inviteEmailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? "Ingresa un correo válido");
      return;
    }
    setEmailError(null);
    // SEC-B5: misma regla que el servidor (12-72 caracteres, 4 clases).
    const manualPassword = password.trim();
    if (manualPassword && !invitePasswordSchema.safeParse(manualPassword).success) {
      setPasswordError(PASSWORD_HINT);
      return;
    }
    setPasswordError(null);
    // R15 AUTH-2: el toast de error lo maneja useEntityMutation; capturamos
    // aquí para evitar unhandled rejection en la consola / Sentry.
    try {
      await inviteUser.mutateAsync({
        email: parsed.data,
        full_name: fullName.trim(),
        role,
        ...(manualPassword ? { password: manualPassword } : {}),
      });
    } catch {
      return;
    }
    setOpen(false);
    setFullName("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setRole("dispatcher");
    onCreated();
  };

  // R10-FE-04: guard capa 3 — cierra la ventana entre el clic y el primer
  // render con isPending=true (mismo patrón que FormActions).
  const inFlightRef = useRef(false);
  const onInviteClick = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await handleInvite();
    } finally {
      inFlightRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="mr-2 h-4 w-4" />Crear usuario</Button>
      </DialogTrigger>
      <FormDialog
      isPending={inviteUser.isPending}
        isDirty={fullName.trim() !== "" || email.trim() !== ""}
        open={open}
        onOpenChange={setOpen}
        title="Crear nuevo usuario"
        description="Crea una nueva cuenta de personal. El usuario recibirá instrucciones de acceso por correo electrónico."
      >
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="inv-name">Nombre Completo</Label>
            <Input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Pérez" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-email">Correo Electrónico</Label>
            <Input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              placeholder="juan@empresa.com"
              aria-invalid={emailError ? true : undefined}
            />
            {emailError ? <p className="text-sm text-destructive">{emailError}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-password">Contraseña inicial (opcional)</Label>
            <Input
              id="inv-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              maxLength={72}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError(null);
              }}
              aria-invalid={passwordError ? true : undefined}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Si la dejas vacía, se genera un enlace de acceso de un solo uso.
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? "Ocultar" : "Mostrar"}
              </Button>
            </div>
            {passwordError ? <p className="text-sm text-destructive">{passwordError}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-role">Rol</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="inv-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {renderRoleBadge(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <FormDialogFooter>
          <FormDialogCancelButton onCancel={() => setOpen(false)} disabled={inviteUser.isPending} />
          <Button onClick={onInviteClick} disabled={inviteUser.isPending || !fullName.trim() || !email.trim()}>
            {inviteUser.isPending ? "Creando…" : "Crear usuario"}
          </Button>
        </FormDialogFooter>
      </FormDialog>
    </Dialog>
  );
}
