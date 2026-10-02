import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supportCaseSchema } from "@/lib/platformSupport.types";
import { callRpc } from "@/lib/rpc";

export function useSupportSharing(reportId: string) {
  const cache = useQueryClient();
  const key = ["feedback-support", reportId];
  const query = useQuery({ queryKey: key, staleTime: 0, refetchOnWindowFocus: false,
    queryFn: async () => supportCaseSchema.nullable().parse(await callRpc<unknown>("get_my_support_case", { p_report: reportId })) });
  const share = useMutation({ meta: { silent: true }, mutationFn: async (input: {
    revision: string; title: string; description: string; severity: string; requestId: string | null; screenshot: boolean;
  }) => supportCaseSchema.parse(await callRpc<unknown>("share_my_support_report", { p_report: reportId,
    p_revision: input.revision, p_title: input.title, p_description: input.description, p_severity: input.severity,
    p_request: input.requestId, p_screenshot: input.screenshot })),
  onSuccess: (record) => cache.setQueryData(key, record) });
  const withdraw = useMutation({ meta: { silent: true }, mutationFn: async (revision: string) =>
    supportCaseSchema.nullable().parse(await callRpc<unknown>("withdraw_my_support_report", { p_report: reportId, p_revision: revision })),
  onSuccess: (record) => cache.setQueryData(key, record) });
  return { query, share, withdraw };
}
