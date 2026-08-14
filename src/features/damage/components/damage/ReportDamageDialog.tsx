import { useState } from "react";
import { CurrencyField, SelectField, TextareaField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { WarnIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useCustomers } from "@/features/customers";
import { useForklifts } from "@/features/fleet";
import { useReportDamageForm } from "../../hooks/useReportDamageForm";
import { DamageEvidenceSection } from "./DamageEvidenceSection";

function getReportButtonLabel(previewsCount: number): string {
  if (previewsCount === 0) return "Reportar";
  if (previewsCount === 1) return "Reportar (1 foto)";
  return `Reportar (${previewsCount} fotos)`;
}

interface ReportDamageDialogProps {
  /**
   * Control externo opcional del estado abierto (p. ej. el CTA del EmptyState
   * de la página). Sin estas props el diálogo se auto-gestiona, como antes.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ReportDamageDialog({ open: openProp, onOpenChange }: ReportDamageDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const { form, previews, onDrop, removePreview, reset, handleSubmit, isProcessing } =
    useReportDamageForm(() => setOpen(false));

  const forkliftOptions = (forklifts ?? []).map((f) => ({
    value: f.id,
    label: `${f.manufacturer} ${f.model} — ${f.name}`,
  }));
  const customerOptions = [
    { value: "", label: "Sin cliente" },
    ...(customers ?? []).map((c) => ({
      value: c.id,
      label: c.company && c.company !== c.name ? `${c.name} — ${c.company}` : c.name,
    })),
  ];

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <WarnIcon className="h-4 w-4 mr-2" />
        Reportar daño
      </Button>
      <FormDialog
      isPending={isProcessing}
      isDirty={form.formState.isDirty || previews.length > 0}
      open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }} width="md" title="Reportar daño manual">
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <SelectField
              control={form.control}
              name="forkliftId"
              label="Montacargas"
              options={forkliftOptions}
              placeholder="Seleccionar montacargas"
              required
            />
            <SelectField
              control={form.control}
              name="customerId"
              label="Cliente (opcional)"
              options={customerOptions}
              placeholder="Sin cliente asociado"
            />
            <TextareaField
              control={form.control}
              name="description"
              label="Descripción del daño"
              placeholder="Describe el daño encontrado…"
              rows={3}
              required
            />
            <CurrencyField
              control={form.control}
              name="estimatedCost"
              label="Costo estimado (opcional)"
              currency="MXN"
            />

            <DamageEvidenceSection previews={previews} onDrop={onDrop} onRemove={removePreview} />

            <FormDialogFooter>
              <FormDialogCancelButton onCancel={() => setOpen(false)} disabled={isProcessing} />
              <Button type="submit" disabled={isProcessing}>
                {isProcessing
                  ? <><SpinnerIcon className="h-4 w-4 animate-spin mr-2" />Guardando…</>
                  : getReportButtonLabel(previews.length)}
              </Button>
            </FormDialogFooter>
          </form>
        </Form>
      </FormDialog>
    </>
  );
}
