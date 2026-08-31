import { useForm } from "react-hook-form";
import { z } from "zod";
import { TextareaField } from "@/components/forms/fields";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormSection } from "@/components/forms/FormSection";
import { Form } from "@/components/ui/form";
import { serviceTypeLabel } from "@/lib/constants";
import { zodResolver } from "@/lib/forms/zodResolver";
import { useReopenWorkOrder } from "../../hooks/maintenance/useReopenWorkOrder";
import type { MaintenanceLog } from "../../hooks/maintenance/useMaintenanceLogs";

const schema = z.object({
  reason: z.string().trim().min(5, "Describe el motivo de la reapertura (mínimo 5 caracteres)"),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: (MaintenanceLog & { forklift_name?: string }) | null;
  onReopened?: () => void;
}

/**
 * Reapertura de una OT cerrada por error (solo admin). El motivo es
 * obligatorio porque la RPC lo exige y queda en la bitácora `status_logs`.
 */
export function ReopenWorkOrderDialog({ open, onOpenChange, log, onReopened }: Props) {
  const reopen = useReopenWorkOrder();
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  });

  const onSubmit = form.handleSubmit((data) => {
    if (!log) return;
    reopen.mutate(
      { id: log.id, reason: data.reason.trim() },
      {
        onSuccess: () => {
          form.reset({ reason: "" });
          onOpenChange(false);
          onReopened?.();
        },
      },
    );
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isPending={reopen.isPending}
      title="Reabrir orden de trabajo"
      description={log ? `${serviceTypeLabel(log.service_type)} — ${log.forklift_name ?? "Equipo"}` : undefined}
      testId="reopen-work-order-dialog"
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormSection title="Motivo" first>
            <TextareaField
              control={form.control}
              name="reason"
              label="¿Por qué se reabre esta OT?"
              rows={3}
              required
              placeholder="Ej.: se cerró por error, falta cargar refacciones del servicio"
            />
            <p className="text-xs text-muted-foreground">
              Al reabrirla vuelve a estado “En progreso” y podrás capturar refacciones y mano de obra.
              El movimiento queda registrado en la bitácora.
            </p>
          </FormSection>

          <FormDialogFooter>
            <FormActions
              submitLabel="Reabrir OT"
              isPending={reopen.isPending}
              onCancel={() => onOpenChange(false)}
            />
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
