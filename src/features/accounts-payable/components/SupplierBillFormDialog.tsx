import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FormActions } from "@/components/forms/FormActions";
import { SupplierSelector } from "@/features/suppliers/components/suppliers/SupplierSelector";
import { toYMD } from "@/lib/date/toYMD";
import { formatDateDisplay } from "@/lib/utils";
import {
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_SAT_OPTIONS,
  CURRENCIES,
} from "../lib/supplierBillConstants";
import { useSupplierBillForm } from "../hooks/useSupplierBillForm";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupplierBillFormDialog({ open, onOpenChange }: Props) {
  const { form, selectedSupplier, suggestedDueDate, total, isPending, onSubmit } =
    useSupplierBillForm(open, () => onOpenChange(false));
  const currency = form.watch("currency");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Cuenta por Pagar</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <SupplierSelector
            value={form.watch("supplier_id")}
            onChange={(v) => form.setValue("supplier_id", v)}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <Select value={form.watch("category")} onValueChange={(v) => form.setValue("category", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_CATEGORY_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Método SAT</Label>
              <Select
                value={form.watch("payment_method_sat") ?? ""}
                onValueChange={(v) => form.setValue("payment_method_sat", v as "PUE" | "PPD")}
              >
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_SAT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DatePickerField
              label="Fecha emisión" required
              date={form.watch("issue_date")}
              onSelect={(d) => d && form.setValue("issue_date", d)}
            />
            <div className="space-y-1">
              <DatePickerField
                label="Vencimiento"
                date={form.watch("due_date")}
                onSelect={(d) => form.setValue("due_date", d)}
              />
              {suggestedDueDate && selectedSupplier?.default_payment_terms_days != null && (
                <p className="text-xs text-muted-foreground">
                  Sugerido: {formatDateDisplay(toYMD(suggestedDueDate) ?? "")} (proveedor a {selectedSupplier.default_payment_terms_days} días)
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={(v) => form.setValue("currency", v as "MXN" | "USD")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de cambio</Label>
              <Input type="number" step="0.0001" {...form.register("exchange_rate")} />
            </div>
            <div className="space-y-1.5">
              <Label>UUID fiscal</Label>
              <Input placeholder="Opcional" {...form.register("cfdi_uuid")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Subtotal *</Label>
              <Input type="number" step="0.01" {...form.register("subtotal")} />
            </div>
            <div className="space-y-1.5">
              <Label>IVA</Label>
              <Input type="number" step="0.01" {...form.register("tax_amount")} />
            </div>
            <div className="space-y-1.5">
              <Label>Retención IVA</Label>
              <Input type="number" step="0.01" {...form.register("retention_iva")} />
            </div>
            <div className="space-y-1.5">
              <Label>Retención ISR</Label>
              <Input type="number" step="0.01" {...form.register("retention_isr")} />
            </div>
          </div>
          <div className="rounded-md bg-muted/50 p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-mono text-lg font-bold">
              {total.toLocaleString("es-MX", { style: "currency", currency })}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea rows={2} {...form.register("description")} />
          </div>
          <DialogFooter>
            <FormActions
              submitLabel="Registrar"
              isPending={isPending}
              onCancel={() => onOpenChange(false)}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
