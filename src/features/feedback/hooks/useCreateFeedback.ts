import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess } from "@/lib/ui/appFeedback";
import type { FeedbackContext } from "./useFeedbackContext";
import type { SelectedElementInfo } from "../lib/cssPath";
import type { FeedbackFormValues } from "../lib/schema";

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
  const { user } = useAuth();

  return useEntityMutation({
    mutationFn: async (input: CreateFeedbackInput) => {
      if (!user?.id) throw new Error("Sesión no disponible");

      let screenshotUrl: string | null = null;
      if (input.screenshot) {
        screenshotUrl = await uploadScreenshot(user.id, input.screenshot);
      }

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
    invalidateKeys: [["feedback_reports"]],
    errorTitle: "No se pudo enviar el reporte",
    onSuccess: (report) => {
      notifySuccess(`Reporte enviado: ${report.folio}`, {
        description: "¡Gracias por ayudarnos a mejorar!",
      });
    },
  });
}
