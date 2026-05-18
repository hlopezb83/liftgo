import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Returns a signed URL (valid 10 min) for a feedback screenshot stored in private bucket. */
export function useFeedbackScreenshotUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["feedback-screenshot-url", path],
    queryFn: async () => {
      if (!path) return null;
      const { data, error } = await supabase.storage
        .from("feedback-screenshots")
        .createSignedUrl(path, 600);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
    enabled: !!path,
    staleTime: 5 * 60_000,
  });
}
