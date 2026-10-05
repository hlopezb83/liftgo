import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { maintenanceGenerationFeedback, type GenerateMaintenanceResponse } from "../../lib/maintenanceGenerationFeedback";

interface Props {
  result: GenerateMaintenanceResponse | null;
  onClose: () => void;
}

export function MaintenanceGenerationResultDialog({ result, onClose }: Props) {
  if (!result) return null;
  const feedback = maintenanceGenerationFeedback(result);
  const counts = [
    ["Registros programados", result.generated],
    ["Ya existentes", result.skipped],
    ["Omitidas por estado", result.omitted_by_status],
    ["Pólizas por revisar", result.failed_policies],
    ["Periodos pendientes", result.pending_remaining],
  ] as const;
  return (
    <FormDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Resultado del mantenimiento mensual"
      description={`Periodos revisados hasta ${result.month}. Los registros quedan programados; generar no confirma que el servicio se haya realizado.`}
      width="xl"
    >
      <div className="space-y-4 pb-4">
        <div className={`rounded-lg border p-3 text-sm ${feedback.kind === "warning" ? "border-warning/40 bg-warning/10" : "bg-muted/40"}`}>
          <p className="font-medium">{feedback.title}</p>
          <p className="mt-1 text-muted-foreground">{feedback.description}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {counts.map(([label, count]) => (
            <div key={label} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{count ?? "Sin confirmar"}</dd>
            </div>
          ))}
        </dl>
        {result.details && result.details.length > 0 && (
          <section aria-label="Detalle de la generación">
            <h3 className="mb-2 text-sm font-medium">Detalle por unidad y periodo</h3>
            <ul className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-3 text-xs">
              {result.details.map((detail, index) => (
                <li key={index} className="break-words">{detail}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <FormDialogFooter>
        <Button onClick={onClose}>Cerrar</Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
