import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { FeedbackFormValues } from "@/features/feedback/lib/schema";
import type { FeedbackContext } from "./useFeedbackContext";
import type { SelectedElementInfo } from "@/features/feedback/lib/cssPath";

interface ExtendedContext extends FeedbackContext {
  selected_element: SelectedElementInfo | null;
}

interface CreateFeedbackInput {
  values: FeedbackFormValues;
  context: ExtendedContext;
  reporterType: "internal" | "customer";
  reporterName: string | null;
  screenshot: File | null;
}

async function uploadScreenshot(userId: string, file: File): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("feedback-screenshots")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

export function useCreateFeedback() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateFeedbackInput) => {
      if (!user?.id) throw new Error("Sesión no disponible");

      let screenshotUrl: string | null = null;
      if (input.screenshot) {
        screenshotUrl = await uploadScreenshot(user.id, input.screenshot);
      }

      // module y severity se omiten: el AI los asigna del lado admin.
      // module usa default 'Sin clasificar' de la columna.
      const payload: TablesInsert<"feedback_reports"> = {
        reporter_id: user.id,
        reporter_type: input.reporterType,
        reporter_name: input.reporterName,
        type: input.values.type,
        module: "Sin clasificar",
        title: input.values.title,
        description: input.values.description,
        screenshot_url: screenshotUrl,
        context_json: input.context as unknown as TablesInsert<"feedback_reports">["context_json"],
      };

      const { data, error } = await supabase
        .from("feedback_reports")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: ["feedback_reports"] });
      toast.success(`Reporte enviado: ${report.folio}`, {
        description: "¡Gracias por ayudarnos a mejorar!",
      });
    },
    onError: (err: Error) => {
      toast.error("No se pudo enviar el reporte", { description: err.message });
    },
  });
}
