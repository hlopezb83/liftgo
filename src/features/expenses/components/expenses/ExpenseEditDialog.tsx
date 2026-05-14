import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SupplierSelector } from "@/components/suppliers/SupplierSelector";
import {
  EXPENSE_CATEGORY_LABELS, useUpdateExpense, type ExpenseCategory, type OperatingExpense,
} from "@/features/expenses/hooks/useOperatingExpenses";
import { useEffect, useState } from "react";

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

interface FormData {
  category: ExpenseCategory;
  description: string;
  amount: string;
  expense_date: string;
  is_recurring: boolean;
  supplier_id: string;
}

interface Props {
  expense: OperatingExpense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExpenseEditDialog({ expense, open, onOpenChange }: Props) {
  const updateExpense = useUpdateExpense();
  const [form, setForm] = useState<FormData>(() => fromExpense(expense));

  useEffect(() => {
    if (expense) setForm(fromExpense(expense));
  }, [expense]);

  const handleSave = () => {
    if (!expense) return;
    const amount = parseFloat(form.amount);
    if (!amount || isNaN(amount)) return;
    updateExpense.mutate(
      {
        id: expense.id,
        category: form.category,
        description: form.description || undefined,
        amount,
        expense_date: form.expense_date,
        is_recurring: form.is_recurring,
        supplier_id: form.supplier_id || null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar Gasto</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Monto</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input type="number" min="0" step="0.01" className="pl-7" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción (opcional)</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <SupplierSelector value={form.supplier_id} onChange={(v) => setForm({ ...form, supplier_id: v })} />
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>Gasto recurrente mensual</Label>
              <p className="text-xs text-muted-foreground">Se podrá generar automáticamente cada mes</p>
            </div>
            <Switch checked={form.is_recurring} onCheckedChange={(v) => setForm({ ...form, is_recurring: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!form.amount || updateExpense.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fromExpense(e: OperatingExpense | null): FormData {
  if (!e) return { category: "renta", description: "", amount: "", expense_date: new Date().toISOString().slice(0, 10), is_recurring: false, supplier_id: "" };
  return {
    category: e.category,
    description: e.description || "",
    amount: String(e.amount),
    expense_date: e.expense_date,
    is_recurring: e.is_recurring ?? false,
    supplier_id: e.supplier_id || "",
  };
}
