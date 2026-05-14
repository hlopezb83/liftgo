import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerName: string;
  email: string;
  setEmail: (v: string) => void;
  isPending: boolean;
  onInvite: () => void;
}

export function CustomerInviteDialog({ open, onOpenChange, customerName, email, setEmail, isPending, onInvite }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar al Portal de Clientes</DialogTitle>
          <DialogDescription>Crear una cuenta de portal para {customerName}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="invite-email">Correo Electrónico</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@ejemplo.com" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onInvite} disabled={isPending || !email}>
            {isPending ? "Enviando..." : "Enviar Invitación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
