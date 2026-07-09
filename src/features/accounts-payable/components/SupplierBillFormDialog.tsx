import { useEffect, useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormActions } from "@/components/forms/FormActions";
import {
  TextField, TextareaField, DateField, NumberField, CurrencyField, type SelectOption,
} from "@/components/forms/fields";
import { SupplierField } from "@/components/forms/fields";
import { toYMD } from "@/lib/date/toYMD";
import { formatDateDisplay } from "@/lib/utils";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORY_GROUPS,
  PAYMENT_METHOD_SAT_OPTIONS,
  CURRENCIES,
} from "../lib/supplierBillConstants";
import { useSupplierBillForm, type SupplierBillFormOverrides } from "../hooks/useSupplierBillForm";
import { useImportSupplierBillCfdi } from "../hooks/useImportSupplierBillCfdi";
import { SupplierBillCfdiDropzone } from "./SupplierBillCfdiDropzone";
import type { SupplierBillDetail } from "../hooks/useSupplierBill";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill?: SupplierBillDetail | null;
  overrides?: SupplierBillFormOverrides;
  titleOverride?: string;
}

const CURRENCY_OPTIONS: SelectOption[] = CURRENCIES.map((c) => ({ value: c, label: c }));

export function SupplierBillFormDialog({ open, onOpenChange, bill, overrides, titleOverride }: Props) {
  const isEdit = !!bill;
  const allowImport = !isEdit && !overrides;

  const cfdi = useImportSupplierBillCfdi();
  const [importedValues, setImportedValues] = useState<SupplierBillFormOverrides | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      cfdi.reset();
      setImportedValues(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeOverrides = overrides ?? importedValues;

  const { form, selectedSupplier, suggestedDueDate, total, isPending, onSubmit } =
    useSupplierBillForm(open, () => onOpenChange(false), bill, activeOverrides);
  const currency = form.watch("currency");

  const handleFile = async (file: File) => {
    const r = await cfdi.importXml(file);
    if (r) {
      const next: SupplierBillFormOverrides = {
        initialValues: r.initialValues,
        cfdiXmlUrl: r.uploaded.signedUrl,
      };
      setImportedValues(next);
      form.reset({
        supplier_id: "", category: "", description: "",
        issue_date: new Date(), currency: "MXN", exchange_rate: 1,
        subtotal: 0, tax_amount: 0, retention_iva: 0, retention_isr: 0,
        cfdi_uuid: "",
        ...r.initialValues,
      });
    }
  };

  const handleClear = () => {
    cfdi.reset();
    setImportedValues(undefined);
    form.reset({
      supplier_id: "", category: "", description: "",
      issue_date: new Date(), currency: "MXN", exchange_rate: 1,
      subtotal: 0, tax_amount: 0, retention_iva: 0, retention_isr: 0,
      cfdi_uuid: "",
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="2xl"
      title={titleOverride ?? (isEdit && bill ? `Editar factura ${bill.bill_number}` : "Nueva Factura de Proveedor")}
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-3">
          {allowImport && (
            <SupplierBillCfdiDropzone
              busy={cfdi.busy}
              error={cfdi.error}
              result={cfdi.result}
              onFile={handleFile}
              onClear={handleClear}
            />
          )}

          <SupplierField control={form.control} name="supplier_id" label="Proveedor" required />

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {EXPENSE_CATEGORY_GROUPS.map((g) => (
                        <SelectGroup key={g.label}>
                          <SelectLabel>{g.label}</SelectLabel>
                          {g.categories.map((v) => (
                            <SelectItem key={v} value={v}>{EXPENSE_CATEGORY_LABELS[v]}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="payment_method_sat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Método SAT</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {PAYMENT_METHOD_SAT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DateField control={form.control} name="issue_date" label="Fecha emisión" required />
            <div className="space-y-1">
              <DateField control={form.control} name="due_date" label="Vencimiento" />
              {suggestedDueDate && selectedSupplier?.default_payment_terms_days != null && (
                <p className="text-xs text-muted-foreground">
                  Sugerido: {formatDateDisplay(toYMD(suggestedDueDate) ?? "")} (proveedor a {selectedSupplier.default_payment_terms_days} días)
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Moneda</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <NumberField
              control={form.control}
              name="exchange_rate"
              label="Tipo de cambio"
              step={0.0001}
              nullOnEmpty={false}
            />
            <TextField
              control={form.control}
              name="cfdi_uuid"
              label="UUID fiscal"
              placeholder="Opcional"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CurrencyField control={form.control} name="subtotal" label="Subtotal" required currency={currency} />
            <CurrencyField control={form.control} name="tax_amount" label="IVA" currency={currency} />
            <CurrencyField control={form.control} name="retention_iva" label="Retención IVA" currency={currency} />
            <CurrencyField control={form.control} name="retention_isr" label="Retención ISR" currency={currency} />
          </div>

          <div className="rounded-md bg-muted/50 p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-mono text-lg font-bold">
              {formatCurrencyWithCode(total, currency)}
            </span>
          </div>

          <TextareaField control={form.control} name="description" label="Descripción" rows={2} />

          <FormDialogFooter>
            <FormActions
              submitLabel={isEdit ? "Guardar cambios" : "Registrar"}
              isPending={isPending}
              onCancel={() => onOpenChange(false)}
            />
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
