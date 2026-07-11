import { useState } from "react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus } from "@/components/icons";
import { STAFF_ROLES, ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import { useInviteUser } from "../../hooks/useUserManagement";
import type { AppRole } from "../../hooks/useUserRole";

interface InviteUserDialogProps {
  onCreated: () => void;
}

export function InviteUserDialog({ onCreated }: InviteUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("dispatcher");
  const inviteUser = useInviteUser();

  const renderRoleBadge = (r: AppRole) => (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[r] ?? ""}`}>
      {ROLE_LABELS[r] || r}
    </span>
  );

  const handleInvite = async () => {
    if (!fullName.trim() || !email.trim()) return;
    await inviteUser.mutateAsync({ email: email.trim(), full_name: fullName.trim(), role });
    setOpen(false);
    setFullName("");
    setEmail("");
    setRole("dispatcher");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="mr-2 h-4 w-4" />Crear Usuario</Button>
      </DialogTrigger>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Crear Nuevo Usuario"
        description="Crea una nueva cuenta de personal. El usuario recibirá instrucciones de acceso por correo electrónico."
      >
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
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleInvite} disabled={inviteUser.isPending || !fullName.trim() || !email.trim()}>
            {inviteUser.isPending ? "Creando…" : "Crear Usuario"}
          </Button>
        </FormDialogFooter>
      </FormDialog>
    </Dialog>
  );
}
