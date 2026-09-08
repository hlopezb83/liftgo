import { classifyFeedbackReportFn } from "@/lib/feedbackAi.functions";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

export interface ClassifyFeedbackArgs {
  reportId: string;
  /** N-46: obligatorio para reclasificar un reporte que ya tiene AI previa. */
  force?: boolean;
}

export function useClassifyFeedback() {
  return useEntityMutation({
    mutationFn: async ({ reportId, force = false }: ClassifyFeedbackArgs) => {
      try {
        return await classifyFeedbackReportFn({ data: { report_id: reportId, force } });
      } catch (error) {
        // N-46: mensaje accionable cuando el reporte ya tenía clasificación.
        const msg = error instanceof Error ? error.message : String(error);
        if (/ya tiene clasificaci/i.test(msg)) {
          throw new Error(
            "Este reporte ya tiene clasificación AI. Usa «Reclasificar» para sobrescribirla.",
          );
        }
        throw error;
      }
    },
    invalidateKeys: [["feedback_reports"]],
    errorTitle: "No se pudo clasificar con AI",
  });
}
