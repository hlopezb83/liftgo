import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      const { data, error } = await supabase.functions.invoke("generate-recurring-maintenance");
      if (error) throw error;
      return data as GenerateMaintenanceResponse;
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
      toast.error(
        err instanceof Error ? err.message : "Error al generar mantenimiento recurrente",
      );
    },
  });
}
