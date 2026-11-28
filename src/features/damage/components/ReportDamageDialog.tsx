import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { CurrencyField, SelectField, TextareaField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { WarnIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useCustomers } from "@/features/customers";
import { useForklifts } from "@/features/fleet";
import { useReportDamageForm } from "../hooks/useReportDamageForm";
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

function CatalogReadState({ query, entity, emptyMessage }: {
  query: { isLoading: boolean; isError: boolean; isSuccess: boolean; isFetching: boolean; error: unknown; data: unknown[] | undefined; refetch: () => unknown };
  entity: string;
  emptyMessage: string;
}) {
  if (query.isError) return <QueryErrorState bare entity={entity} error={query.error} isRetrying={query.isFetching} onRetry={() => { void query.refetch(); }} />;
  if (query.isLoading) return <p role="status" className="text-sm text-muted-foreground">Cargando {entity}…</p>;
  if (query.isSuccess && query.data?.length === 0) return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  return null;
}

export function ReportDamageDialog({ open: openProp, onOpenChange }: ReportDamageDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  const forklifts = useForklifts();
  const customers = useCustomers();
  const { form, previews, onDrop, removePreview, reset, handleSubmit, isProcessing } =
    useReportDamageForm(() => setOpen(false));

  const forkliftOptions = (forklifts.data ?? []).map((f) => ({
    value: f.id,
    label: `${f.manufacturer} ${f.model} — ${f.name}`,
  }));
  const customerOptions = [
    { value: "__none__", label: "Sin cliente" },
    ...(customers.data ?? []).map((c) => ({
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
              disabled={forklifts.isLoading || forklifts.isError}
              required
            />
            <CatalogReadState query={forklifts} entity="los montacargas" emptyMessage="No hay montacargas disponibles para reportar un daño." />
            <SelectField
              control={form.control}
              name="customerId"
              label="Cliente (opcional)"
              options={customerOptions}
              placeholder="Sin cliente asociado"
              disabled={customers.isLoading || customers.isError}
              onValueChange={(value) => { if (value === "__none__") form.setValue("customerId", "", { shouldDirty: true }); }}
            />
            <CatalogReadState query={customers} entity="los clientes" emptyMessage="No hay clientes disponibles. Puedes reportar el daño sin cliente asociado." />
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
