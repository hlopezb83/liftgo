import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { STAFF_ROLES, ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import { useInviteUser } from "@/hooks/useUserManagement";
import type { AppRole } from "@/hooks/useUserRole";

interface InviteUserDialogProps {
  onCreated: (credentials: { email: string; password: string }) => void;
}

export function InviteUserDialog({ onCreated }: InviteUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("dispatcher");
  const inviteUser = useInviteUser();

  const renderRoleBadge = (r: AppRole) => (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[r] ?? ""}`}>
      {ROLE_LABELS[r] || r}
    </span>
  );

  const handleInvite = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 6) return;
    const result = await inviteUser.mutateAsync({ email: email.trim(), full_name: fullName.trim(), role, password });
    setOpen(false);
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("dispatcher");
    onCreated({ email: result.email, password: result.password });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="mr-2 h-4 w-4" />Crear Usuario</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear Nuevo Usuario</DialogTitle>
          <DialogDescription>Crea una nueva cuenta de personal. Podrá iniciar sesión de inmediato.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="inv-name">Nombre Completo</Label>
            <Input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Pérez" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-email">Correo Electrónico</Label>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@empresa.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-password">Contraseña</Label>
            <Input id="inv-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            {password.length > 0 && password.length < 6 && (
              <p className="text-sm text-destructive">La contraseña debe tener al menos 6 caracteres</p>
            )}
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
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleInvite} disabled={inviteUser.isPending || !fullName.trim() || !email.trim() || password.length < 6}>
            {inviteUser.isPending ? "Creando…" : "Crear Usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
