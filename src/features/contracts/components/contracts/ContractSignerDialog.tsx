import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ContractSignerDialog({ open, onOpenChange, onSave, pending }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<void>;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const save = async () => {
    if (!name.trim()) return;
    try {
      await onSave(name.trim());
      setName("");
      onOpenChange(false);
    } catch {
      // La mutación muestra el error; conservar la captura para reintentar.
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar firmante</DialogTitle>
          <DialogDescription>El contrato enviado conservará sus condiciones. Captura sólo el nombre de quien firmará.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="contract-signer">Firmado por</Label>
          <Input id="contract-signer" value={name} onChange={(event) => setName(event.target.value)} maxLength={150} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={pending || !name.trim()} onClick={() => { void save(); }}>Guardar firmante</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
