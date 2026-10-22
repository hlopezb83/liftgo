import { useEffect, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import { TextareaField, type SelectOption } from "@/components/forms/fields";
import { SupplierField } from "@/components/forms/fields";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormSection } from "@/components/forms/FormSection";
import { Form } from "@/components/ui/form";
import { useCxpApprovalThreshold } from "@/features/company-settings";
import { useImportSupplierBillCfdi } from "../hooks/useImportSupplierBillCfdi";
import { useSupplierBillForm, type SupplierBillFormOverrides, type SupplierBillFormData } from "../hooks/useSupplierBillForm";
import { CURRENCIES } from "../lib/supplierBillConstants";
import { SupplierBillCfdiDropzone } from "./SupplierBillCfdiDropzone";
import { SupplierBillFormFields } from "./SupplierBillFormFields";
import { SupplierBillTotalPanel } from "./SupplierBillTotalPanel";
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
  const importSnapshot = useRef<{ before: SupplierBillFormData; imported: Partial<SupplierBillFormData> } | null>(null);
  const [importedValues, setImportedValues] = useState<SupplierBillFormOverrides | undefined>(undefined);

  useEffect(() => {
    if (!open) importSnapshot.current = null;
  }, [open]);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      cfdi.reset();
      setImportedValues(undefined);
    }
  }


  const activeOverrides = overrides ?? importedValues;
  const { form, selectedSupplier, suggestedDueDate, total, isPending, onSubmit } =
    useSupplierBillForm(open, () => onOpenChange(false), bill, activeOverrides);
  // R19-A: mismo bug de watch() en render — usar useWatch.
  const currency = useWatch({ control: form.control, name: "currency" });
  // Aviso temprano: si el total en MXN supera el umbral, la factura nace pendiente de aprobación.
  const { data: cxpThreshold } = useCxpApprovalThreshold();
  const threshold = cxpThreshold?.threshold ?? 0;
  const exchangeRate = useWatch({ control: form.control, name: "exchange_rate" });
  const totalMxn = currency === "MXN" ? total : total * Number(exchangeRate || 1);

  const handleFile = async (file: File) => {
    const r = await cfdi.importXml(file);
    if (r) {
      const before = form.getValues();
      importSnapshot.current = { before, imported: r.initialValues };
      setImportedValues({ initialValues: r.initialValues, cfdiXmlUrl: r.uploaded.path });
      form.reset({ ...before, ...r.initialValues }, { keepDefaultValues: true });
    }
  };

  const handleClear = () => {
    cfdi.reset();
    setImportedValues(undefined);
    const snapshot = importSnapshot.current;
    if (snapshot) {
      const current = form.getValues();
      const restored = { ...current };
      for (const key of Object.keys(snapshot.imported) as Array<keyof SupplierBillFormData>) {
        const value = current[key];
        const imported = snapshot.imported[key];
        const unchanged = value instanceof Date && imported instanceof Date
          ? value.getTime() === imported.getTime()
          : value === imported;
        if (unchanged) Object.assign(restored, { [key]: snapshot.before[key] });
      }
      form.reset(restored, { keepDefaultValues: true });
    }
    importSnapshot.current = null;
  };

  return (
    <FormDialog
      isPending={isPending}
      isDirty={form.formState.isDirty}
      open={open}
      onOpenChange={onOpenChange}
      width="2xl"
      title={titleOverride ?? (isEdit && bill ? `Editar factura ${bill.bill_number}` : "Nueva factura de proveedor")}
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          {allowImport && (
            <FormSection title="Comprobante fiscal (XML)" first>
              <SupplierBillCfdiDropzone
                busy={cfdi.busy}
                error={cfdi.error}
                result={cfdi.result}
                onFile={handleFile}
                onClear={handleClear}
              />
              <p className="text-xs text-muted-foreground">
                Sube el XML del CFDI y llenamos proveedor, importes, UUID y fechas automáticamente.
                También puedes capturar los datos a mano.
              </p>
            </FormSection>
          )}
          <FormSection title="Proveedor" first={!allowImport}>
            <SupplierField control={form.control} name="supplier_id" label="Proveedor" required />
            <TextareaField control={form.control} name="description" label="Descripción" rows={2} />
          </FormSection>
          <SupplierBillFormFields
            form={form as never}
            currency={currency}
            currencyOptions={CURRENCY_OPTIONS}
            selectedSupplier={selectedSupplier}
            suggestedDueDate={suggestedDueDate}
          />
          <SupplierBillTotalPanel
            total={total}
            currency={currency}
            totalMxn={totalMxn}
            threshold={threshold}
          />


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

