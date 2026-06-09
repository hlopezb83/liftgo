import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormActions } from "@/components/FormActions";
import { notifyError } from "@/lib/ui/appFeedback";
import {
  isValidClabe,
  useCreateSupplierBankAccount,
  useUpdateSupplierBankAccount,
  type SupplierBankAccount,
} from "@/features/suppliers/hooks/useSupplierBankAccounts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  account: SupplierBankAccount | null;
}

interface FormState {
  bank_name: string;
  account_holder: string;
  clabe: string;
  account_number: string;
  currency: "MXN" | "USD";
  notes: string;
  is_primary: boolean;
}

const empty: FormState = {
  bank_name: "", account_holder: "", clabe: "", account_number: "",
  currency: "MXN", notes: "", is_primary: false,
};

export function SupplierBankAccountFormDialog({ open, onOpenChange, supplierId, account }: Props) {
  const [form, setForm] = useState<FormState>(empty);
  const create = useCreateSupplierBankAccount();
  const update = useUpdateSupplierBankAccount();

  useEffect(() => {
    if (!open) return;
    if (account) {
      setForm({
        bank_name: account.bank_name,
        account_holder: account.account_holder,
        clabe: account.clabe || "",
        account_number: account.account_number || "",
        currency: (account.currency === "USD" ? "USD" : "MXN"),
        notes: account.notes || "",
        is_primary: account.is_primary,
      });
    } else {
      setForm(empty);
    }
  }, [open, account]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const bank = form.bank_name.trim();
    const holder = form.account_holder.trim();
    if (!bank || !holder) {
      notifyError({ message: "Banco y titular son requeridos" });
      return;
    }
    const clabeTrim = form.clabe.trim();
    if (clabeTrim && !isValidClabe(clabeTrim)) {
      notifyError({ message: "La CLABE debe tener exactamente 18 dígitos" });
      return;
    }
    const payload = {
      bank_name: bank,
      account_holder: holder,
      clabe: clabeTrim || null,
      account_number: form.account_number.trim() || null,
      currency: form.currency,
      notes: form.notes.trim() || null,
      is_primary: form.is_primary,
    };
    if (account) {
      update.mutate(
        { id: account.id, supplier_id: supplierId, patch: payload },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      create.mutate(
        { ...payload, supplier_id: supplierId },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Banco *</Label>
            <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="BBVA, Banorte..." maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>Titular *</Label>
            <Input value={form.account_holder} onChange={(e) => set("account_holder", e.target.value)} maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>CLABE (18 dígitos)</Label>
              <Input
                value={form.clabe}
                onChange={(e) => set("clabe", e.target.value.replace(/\D/g, "").slice(0, 18))}
                placeholder="012345678901234567"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select value={form.currency} onValueChange={(v) => set("currency", v === "USD" ? "USD" : "MXN")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MXN">MXN</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Núm. de cuenta (opcional)</Label>
            <Input value={form.account_number} onChange={(e) => set("account_number", e.target.value)} maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Cuenta primaria</Label>
              <p className="text-xs text-muted-foreground">Solo una por proveedor.</p>
            </div>
            <Switch checked={form.is_primary} onCheckedChange={(v) => set("is_primary", v)} />
          </div>
          <DialogFooter>
            <FormActions
              submitLabel={account ? "Guardar" : "Agregar"}
              isPending={create.isPending || update.isPending}
              onCancel={() => onOpenChange(false)}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
