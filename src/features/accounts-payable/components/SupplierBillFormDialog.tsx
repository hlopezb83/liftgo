import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { SupplierSelector } from "@/features/suppliers/components/suppliers/SupplierSelector";
import { toYMD } from "@/lib/date/toYMD";
import { nowMty } from "@/lib/utils";
import {
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_SAT_OPTIONS,
  CURRENCIES,
  type ExpenseCategory,
} from "../lib/supplierBillConstants";
import { useCreateSupplierBill } from "../hooks/useSupplierBillMutations";

const schema = z.object({
  supplier_id: z.string().min(1, "Selecciona un proveedor"),
  category: z.string().min(1, "Selecciona una categoría"),
  description: z.string().default(""),
  issue_date: z.date({ required_error: "Fecha de emisión requerida" }),
  due_date: z.date().optional(),
  currency: z.enum(["MXN", "USD"]),
  exchange_rate: z.coerce.number().positive().default(1),
  subtotal: z.coerce.number().nonnegative("Subtotal inválido"),
  tax_amount: z.coerce.number().nonnegative().default(0),
  retention_iva: z.coerce.number().nonnegative().default(0),
  retention_isr: z.coerce.number().nonnegative().default(0),
  cfdi_uuid: z.string().default(""),
  payment_method_sat: z.enum(["PUE", "PPD"]).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupplierBillFormDialog({ open, onOpenChange }: Props) {
  const create = useCreateSupplierBill();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplier_id: "",
      category: "",
      description: "",
      issue_date: nowMty(),
      currency: "MXN",
      exchange_rate: 1,
      subtotal: 0,
      tax_amount: 0,
      retention_iva: 0,
      retention_isr: 0,
      cfdi_uuid: "",
    },
  });

  useEffect(() => {
    if (open) form.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const subtotal = form.watch("subtotal") || 0;
  const tax = form.watch("tax_amount") || 0;
  const retIva = form.watch("retention_iva") || 0;
  const retIsr = form.watch("retention_isr") || 0;
  const total = Number(subtotal) + Number(tax) - Number(retIva) - Number(retIsr);

  const onSubmit = (data: FormData) => {
    create.mutate(
      {
        supplier_id: data.supplier_id,
        category: data.category as ExpenseCategory,
        description: data.description || null,
        issue_date: toYMD(data.issue_date) ?? "",
        due_date: toYMD(data.due_date) ?? null,
        currency: data.currency,
        exchange_rate: data.exchange_rate,
        subtotal: data.subtotal,
        tax_amount: data.tax_amount,
        retention_iva: data.retention_iva,
        retention_isr: data.retention_isr,
        total,
        cfdi_uuid: data.cfdi_uuid || null,
        payment_method_sat: data.payment_method_sat ?? null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Cuenta por Pagar</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
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
              label="Fecha emisión"
              required
              date={form.watch("issue_date")}
              onSelect={(d) => d && form.setValue("issue_date", d)}
            />
            <DatePickerField
              label="Vencimiento"
              date={form.watch("due_date")}
              onSelect={(d) => form.setValue("due_date", d)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select value={form.watch("currency")} onValueChange={(v) => form.setValue("currency", v as "MXN" | "USD")}>
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
              {total.toLocaleString("es-MX", { style: "currency", currency: form.watch("currency") })}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea rows={2} {...form.register("description")} />
          </div>
          <DialogFooter>
            <FormActions
              submitLabel="Registrar"
              isPending={create.isPending}
              onCancel={() => onOpenChange(false)}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
