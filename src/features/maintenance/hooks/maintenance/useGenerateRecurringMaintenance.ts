import { useQueryClient } from "@tanstack/react-query";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyInfo, notifySuccess, notifyWarning } from "@/lib/ui/appFeedback";
import { maintenanceGenerationFeedback, type GenerateMaintenanceResponse } from "../../lib/maintenanceGenerationFeedback";
import { maintenanceLogKeys } from "../../lib/queryKeys";

/**
 * Disparador del Edge Function `generate-recurring-maintenance`.
 * Programa los periodos pendientes de las pólizas elegibles, con resumen parcial.
 */
export function useGenerateRecurringMaintenance(onResult?: (result: GenerateMaintenanceResponse) => void) {
  const queryClient = useQueryClient();

  return useEntityMutation<void, GenerateMaintenanceResponse>({
    mutationFn: async (): Promise<GenerateMaintenanceResponse> => {
      return await invokeEdgeFunction<GenerateMaintenanceResponse>(
        "generate-recurring-maintenance",
      );
    },
    onSuccess: (result) => {
      onResult?.(result);
      const feedback = maintenanceGenerationFeedback(result);
      const action = onResult ? { label: "Ver resultado", onClick: () => onResult(result) } : undefined;
      if (feedback.kind === "warning") {
        notifyWarning({
          title: feedback.title,
          description: feedback.description,
          action,
          error: { message: feedback.title, details: result.details },
          context: { ...result },
        });
      } else if (feedback.kind === "success") {
        notifySuccess(feedback.title, { description: feedback.description, action });
      } else {
        notifyInfo(feedback.title, { description: feedback.description, action });
      }
      if (result.generated > 0) {
        void queryClient.invalidateQueries({ queryKey: maintenanceLogKeys.all });
      }
    },
    errorTitle: "No se pudo generar el mantenimiento mensual",
  });
}
