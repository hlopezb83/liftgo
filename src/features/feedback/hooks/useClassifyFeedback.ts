import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

export function useClassifyFeedback() {
  return useEntityMutation({
    mutationFn: async (reportId: string) => {
      const { data, error } = await supabase.functions.invoke("classify-feedback-report", {
        body: { report_id: reportId },
      });
      if (error) throw error;
      return data;
    },
    invalidateKeys: [["feedback_reports"]],
    errorTitle: "No se pudo clasificar con AI",
  });
}
