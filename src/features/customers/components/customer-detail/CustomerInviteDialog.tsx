import { Button } from "@/components/ui/button";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invitar al Portal de Clientes"
      description={`Crear una cuenta de portal para ${customerName}.`}
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="invite-email">Correo Electrónico</Label>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@ejemplo.com" />
        </div>
      </div>
      <FormDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={onInvite} disabled={isPending || !email}>
          {isPending ? "Enviando..." : "Enviar Invitación"}
        </Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
