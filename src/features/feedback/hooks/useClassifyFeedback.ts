import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

export interface ClassifyFeedbackArgs {
  reportId: string;
  /** N-46: obligatorio para reclasificar un reporte que ya tiene AI previa. */
  force?: boolean;
}

export function useClassifyFeedback() {
  return useEntityMutation({
    mutationFn: async ({ reportId, force = false }: ClassifyFeedbackArgs) => {
      const { data, error } = await supabase.functions.invoke("classify-feedback-report", {
        body: { report_id: reportId, force },
      });
      if (error) {
        // N-46: el 409 llega como error genérico; leemos el cuerpo real.
        if (error instanceof FunctionsHttpError && error.context.status === 409) {
          throw new Error(
            "Este reporte ya tiene clasificación AI. Usa «Reclasificar» para sobrescribirla.",
          );
        }
        throw error;
      }
      return data;
    },
    invalidateKeys: [["feedback_reports"]],
    errorTitle: "No se pudo clasificar con AI",
  });
}
