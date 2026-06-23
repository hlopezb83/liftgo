import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { toast } from "sonner";

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

  return useMutation({
    mutationFn: async (): Promise<GenerateMaintenanceResponse> => {
      return await invokeEdgeFunction<GenerateMaintenanceResponse>(
        "generate-recurring-maintenance",
      );
    },
    onSuccess: (result) => {
      if (result.generated > 0) {
        toast.success(
          `${result.generated} registro(s) de mantenimiento generado(s) para ${result.month}`,
        );
        queryClient.invalidateQueries({ queryKey: ["maintenance_logs"] });
      } else {
        toast.info("No hay pólizas pendientes de generar para este mes");
      }
    },
    onError: (err: unknown) => {
      notifyError({ error: err, message: "Error al generar mantenimiento recurrente" });
    },
  });
}
