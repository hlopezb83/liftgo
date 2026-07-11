import { useEffect, useEffectEvent, useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/forms/FormActions";
import { TextareaField, type SelectOption } from "@/components/forms/fields";
import { SupplierField } from "@/components/forms/fields";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { CURRENCIES } from "../lib/supplierBillConstants";
import { useSupplierBillForm, type SupplierBillFormOverrides } from "../hooks/useSupplierBillForm";
import { useImportSupplierBillCfdi } from "../hooks/useImportSupplierBillCfdi";
import { SupplierBillCfdiDropzone } from "./SupplierBillCfdiDropzone";
import { SupplierBillFormFields } from "./SupplierBillFormFields";
import type { SupplierBillDetail } from "../hooks/useSupplierBill";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill?: SupplierBillDetail | null;
  overrides?: SupplierBillFormOverrides;
  titleOverride?: string;
}

const CURRENCY_OPTIONS: SelectOption[] = CURRENCIES.map((c) => ({ value: c, label: c }));

const EMPTY_FORM = {
  supplier_id: "", category: "", description: "",
  issue_date: new Date(), currency: "MXN" as const, exchange_rate: 1,
  subtotal: 0, tax_amount: 0, retention_iva: 0, retention_isr: 0,
  cfdi_uuid: "",
};


export function SupplierBillFormDialog({ open, onOpenChange, bill, overrides, titleOverride }: Props) {
  const isEdit = !!bill;
  const allowImport = !isEdit && !overrides;

  const cfdi = useImportSupplierBillCfdi();
  const [importedValues, setImportedValues] = useState<SupplierBillFormOverrides | undefined>(undefined);

  const resetOnClose = useEffectEvent(() => {
    cfdi.reset();
    setImportedValues(undefined);
  });
  useEffect(() => {
    if (!open) resetOnClose();
  }, [open, resetOnClose]);


  const activeOverrides = overrides ?? importedValues;
  const { form, selectedSupplier, suggestedDueDate, total, isPending, onSubmit } =
    useSupplierBillForm(open, () => onOpenChange(false), bill, activeOverrides);
  const currency = form.watch("currency");

  const handleFile = async (file: File) => {
    const r = await cfdi.importXml(file);
    if (r) {
      setImportedValues({ initialValues: r.initialValues, cfdiXmlUrl: r.uploaded.signedUrl });
      form.reset({ ...EMPTY_FORM, ...r.initialValues });
    }
  };

  const handleClear = () => {
    cfdi.reset();
    setImportedValues(undefined);
    form.reset(EMPTY_FORM);
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
          <SupplierBillFormFields
            form={form as never}
            currency={currency}
            currencyOptions={CURRENCY_OPTIONS}
            selectedSupplier={selectedSupplier}
            suggestedDueDate={suggestedDueDate}
          />
          <div className="rounded-md bg-muted/50 p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-mono text-lg font-bold">{formatCurrencyWithCode(total, currency)}</span>
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

