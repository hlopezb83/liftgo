import { useQueryClient } from "@tanstack/react-query";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyInfo, notifySuccess } from "@/lib/ui/appFeedback";
import { maintenanceLogKeys } from "../../lib/queryKeys";

interface GenerateMaintenanceResponse {
  generated: number;
  skipped: number;
  month: string;
  details?: string[];
}

/**
 * Disparador del Edge Function `generate-recurring-maintenance`.
 * Crea registros de mantenimiento del mes para todas las pólizas activas.
 */
export function useGenerateRecurringMaintenance() {
  const queryClient = useQueryClient();

  return useEntityMutation<void, GenerateMaintenanceResponse>({
    mutationFn: async (): Promise<GenerateMaintenanceResponse> => {
      return await invokeEdgeFunction<GenerateMaintenanceResponse>(
        "generate-recurring-maintenance",
      );
    },
    onSuccess: (result) => {
      if (result.generated > 0) {
        notifySuccess(
          `${result.generated} registro(s) de mantenimiento generado(s) para ${result.month}`,
        );
        void queryClient.invalidateQueries({ queryKey: maintenanceLogKeys.all });
      } else {
        notifyInfo("No hay pólizas pendientes de generar para este mes");
      }
    },
    errorTitle: "Error al generar mantenimiento recurrente",
  });
}
