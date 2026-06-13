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

function defaultsFor(initial?: BankAccount | null) {
  const i = initial ?? {} as Partial<BankAccount>;
  return {
    name: i.name ?? "",
    bank: i.bank ?? "",
    last4: i.last4 ?? "",
    currency: i.currency ?? "MXN",
    initialBalance: String(i.initial_balance ?? "0"),
    isActive: i.is_active ?? true,
    notes: i.notes ?? "",
  };
}

function useBankAccountFormState(initial?: BankAccount | null) {
  const d = defaultsFor(initial);
  const [name, setName] = useState(d.name);
  const [bank, setBank] = useState(d.bank);
  const [last4, setLast4] = useState(d.last4);
  const [currency, setCurrency] = useState(d.currency);
  const [initialBalance, setInitialBalance] = useState(d.initialBalance);
  const [isActive, setIsActive] = useState(d.isActive);
  const [notes, setNotes] = useState(d.notes);
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
            <Input value={s.name} onChange={(e) => s.setName(e.target.value)} placeholder="BBVA Operaciones" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Banco *</Label>
              <Input value={s.bank} onChange={(e) => s.setBank(e.target.value)} placeholder="BBVA" />
            </div>
            <div className="grid gap-1.5">
              <Label>Últimos 4</Label>
              <Input maxLength={4} value={s.last4} onChange={(e) => s.setLast4(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Moneda</Label>
              <Select value={s.currency} onValueChange={s.setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MXN">MXN</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Saldo inicial</Label>
              <Input type="number" step="0.01" value={s.initialBalance} onChange={(e) => s.setInitialBalance(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Activa</Label>
            <Switch checked={s.isActive} onCheckedChange={s.setIsActive} />
          </div>
          <div className="grid gap-1.5">
            <Label>Notas</Label>
            <Input value={s.notes} onChange={(e) => s.setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!s.name.trim() || !s.bank.trim() || upsert.isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
