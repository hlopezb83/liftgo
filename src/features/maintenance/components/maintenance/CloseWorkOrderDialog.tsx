import { useForm } from "react-hook-form";
import { z } from "zod";
import { DateField, TextareaField } from "@/components/forms/fields";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormSection } from "@/components/forms/FormSection";
import { WarnIcon } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form } from "@/components/ui/form";
import { toYMD } from "@/lib/date/toYMD";
import { zodResolver } from "@/lib/forms/zodResolver";
import { nowMty } from "@/lib/utils";
import { useCloseWorkOrder, useOpenDamageForLog } from "../../hooks/maintenance/useWorkOrderClose";
import { WorkOrderCloseSummary } from "./WorkOrderCloseSummary";
import type { MaintenanceLog } from "../../hooks/maintenance/useMaintenanceLogs";

const schema = z.object({
  closed_at: z.date({ error: "Fecha de cierre requerida" }),
  closing_notes: z.string().default(""),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: (MaintenanceLog & { forklift_name?: string }) | null;
  onClosed?: () => void;
  onCancel?: () => void;
}

/**
 * Diálogo de cierre de Orden de Trabajo. Antes el cierre era un arrastre
 * silencioso en el kanban: aquí el usuario ve el costo final, se le avisa
 * que las secciones quedarán bloqueadas y puede sellar fecha y notas.
 */
export function CloseWorkOrderDialog({ open, onOpenChange, log, onClosed, onCancel }: Props) {
  const close = useCloseWorkOrder();
  const { data: openDamage } = useOpenDamageForLog(open ? log?.id : null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { closed_at: nowMty(), closing_notes: "" },
  });

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const onSubmit = form.handleSubmit((data) => {
    if (!log) return;
    // BL-R8-07: nunca enviar el cierre con daño abierto — el trigger R8-DB-02
    // es la autoridad, pero no dependemos del error del servidor.
    if (openDamage) return;
    const note = data.closing_notes.trim();
    const description = note
      ? [log.description, `Cierre: ${note}`].filter(Boolean).join("\n")
      : null;
    close.mutate(
      { id: log.id, performedAt: toYMD(data.closed_at) ?? "", description },
      {
        onSuccess: () => {
          form.reset({ closed_at: nowMty(), closing_notes: "" });
          onOpenChange(false);
          onClosed?.();
        },
        onError: () => onCancel?.(),
      },
    );
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : handleCancel())}
      isPending={close.isPending}
      title="Cerrar orden de trabajo"
      description={log ? `${log.service_type} — ${log.forklift_name ?? "Equipo"}` : undefined}
      testId="close-work-order-dialog"
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormSection title="Resumen del servicio" first>
            {log && <WorkOrderCloseSummary maintenanceLogId={log.id} manualCost={Number(log.manual_cost ?? 0)} />}
            {openDamage && (
              <Alert variant="destructive">
                <WarnIcon className="h-4 w-4" />
                <AlertTitle>Hay un daño abierto ligado a esta OT</AlertTitle>
                <AlertDescription>
                  {openDamage.description} — marca el daño como reparado antes de cerrar.
                  El cierre está bloqueado mientras el daño siga abierto.
                </AlertDescription>
              </Alert>
            )}
          </FormSection>

          <FormSection title="Cierre">
            <DateField control={form.control} name="closed_at" label="Fecha de cierre" required />
            <TextareaField
              control={form.control}
              name="closing_notes"
              label="Notas de cierre"
              rows={2}
              placeholder="Opcional: trabajos realizados, pendientes, observaciones"
            />
            <p className="text-xs text-muted-foreground">
              Al cerrar ya no podrás agregar refacciones ni mano de obra a esta orden.
            </p>
          </FormSection>

          <FormDialogFooter>
            <FormActions
              submitLabel="Cerrar OT"
              isPending={close.isPending}
              onCancel={handleCancel}
              submitDisabled={!!openDamage}
              submitDisabledReason="No se puede cerrar: hay un daño abierto ligado a esta OT."
            />
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
