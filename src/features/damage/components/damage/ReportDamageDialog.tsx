import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { CurrencyField, SelectField, TextareaField } from "@/components/forms/fields";
import { useForklifts } from "@/features/fleet";
import { useCustomers } from "@/features/customers";
import { useReportDamageForm } from "../../hooks/useReportDamageForm";
import { DamageEvidenceSection } from "./DamageEvidenceSection";

function getReportButtonLabel(previewsCount: number): string {
  if (previewsCount === 0) return "Reportar";
  if (previewsCount === 1) return "Reportar (1 foto)";
  return `Reportar (${previewsCount} fotos)`;
}

export function ReportDamageDialog() {
  const [open, setOpen] = useState(false);
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
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <AlertTriangle className="h-4 w-4 mr-2" />
          Reportar Daño
        </Button>
      </DialogTrigger>
      <FormDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }} width="md" title="Reportar Daño Manual">
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
              placeholder="Describe el daño encontrado..."
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isProcessing}>
                {isProcessing
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Guardando…</>
                  : getReportButtonLabel(previews.length)}
              </Button>
            </FormDialogFooter>
          </form>
        </Form>
      </FormDialog>
    </Dialog>
  );
}
