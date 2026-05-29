import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
export function useClassifyFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data, error } = await supabase.functions.invoke("classify-feedback-report", {
        body: { report_id: reportId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback_reports"] });
    },
    onError: (err: Error) => {
      notifyError({ title: "No se pudo clasificar con AI", error: err });
    },
  });
}
