import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
      toast.error("No se pudo clasificar con AI", { description: err.message });
    },
  });
}
