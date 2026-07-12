import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { feedbackScreenshotUrlKeys } from "../lib/queryKeys";

export const feedbackScreenshotUrlQueries = defineEntityQueries<
  typeof feedbackScreenshotUrlKeys.all[number],
  string | null,
  never
>("feedback-screenshot-url", {
  list: (filter) => async () => {
    const path = filter?.path as string | null | undefined;
    if (!path) return null;
    const { data, error } = await supabase.storage
      .from("feedback-screenshots")
      .createSignedUrl(path, 600);
    if (error) throw error;
    return data?.signedUrl ?? null;
  },
  staleTime: 5 * 60_000,
});

/** Returns a signed URL (valid 10 min) for a feedback screenshot stored in private bucket. */
export function useFeedbackScreenshotUrl(path: string | null | undefined) {
  return useQuery({
    ...feedbackScreenshotUrlQueries.list({ path: path ?? null }),
    enabled: !!path,
  });
}
