import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpsertBankAccount, type BankAccount } from "../hooks/useBankAccounts";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: BankAccount | null;
}

function useBankAccountFormState(initial?: BankAccount | null) {
  const [name, setName] = useState(initial?.name ?? "");
  const [bank, setBank] = useState(initial?.bank ?? "");
  const [last4, setLast4] = useState(initial?.last4 ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "MXN");
  const [initialBalance, setInitialBalance] = useState(String(initial?.initial_balance ?? "0"));
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return {
    name, setName, bank, setBank, last4, setLast4, currency, setCurrency,
    initialBalance, setInitialBalance, isActive, setIsActive, notes, setNotes,
  };
}

export function BankAccountFormDialog({ open, onOpenChange, initial }: Props) {
  const s = useBankAccountFormState(initial);
  const upsert = useUpsertBankAccount();

  const handleSave = () => {
    upsert.mutate(
      {
        id: initial?.id,
        name: s.name.trim(),
        bank: s.bank.trim(),
        last4: s.last4.trim() || null,
        currency: s.currency,
        initial_balance: Number(s.initialBalance) || 0,
        is_active: s.isActive,
        notes: s.notes.trim() || null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nombre interno *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="BBVA Operaciones" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Banco *</Label>
              <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="BBVA" />
            </div>
            <div className="grid gap-1.5">
              <Label>Últimos 4</Label>
              <Input maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MXN">MXN</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Saldo inicial</Label>
              <Input type="number" step="0.01" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Activa</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="grid gap-1.5">
            <Label>Notas</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || !bank.trim() || upsert.isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
