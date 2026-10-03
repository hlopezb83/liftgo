import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supportCaseSchema } from "@/lib/platformSupport.types";
import { callRpc } from "@/lib/rpc";
import { withSupportRequest } from "@/lib/supportRequest";

export function useSupportSharing(reportId: string) {
  const cache = useQueryClient();
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const key = ["feedback-support", reportId];
  const query = useQuery({ queryKey: key, staleTime: 0, retry: false, refetchOnWindowFocus: false,
    queryFn: ({ signal }) => withSupportRequest(async (requestSignal) => supportCaseSchema.nullable().parse(
      await callRpc<unknown>("get_my_support_case", { p_report: reportId }, { signal: requestSignal })), signal) });
  const share = useMutation({ retry: false, meta: { silent: true }, mutationFn: async (input: {
    revision: string; title: string; description: string; severity: string; requestId: string | null; screenshot: boolean;
  }) => withSupportRequest(async (signal) => supportCaseSchema.parse(await callRpc<unknown>("share_my_support_report", { p_report: reportId,
    p_revision: input.revision, p_title: input.title, p_description: input.description, p_severity: input.severity,
    p_request: input.requestId, p_screenshot: input.screenshot }, { signal }))),
  onError: () => setNeedsRefresh(true),
  onSuccess: (record) => { setNeedsRefresh(false); cache.setQueryData(key, record); } });
  const withdraw = useMutation({ retry: false, meta: { silent: true }, mutationFn: async (revision: string) =>
    withSupportRequest(async (signal) => supportCaseSchema.nullable().parse(await callRpc<unknown>("withdraw_my_support_report", { p_report: reportId, p_revision: revision }, { signal }))),
  onError: () => setNeedsRefresh(true),
  onSuccess: (record) => { setNeedsRefresh(false); cache.setQueryData(key, record); } });
  async function refresh() {
    const result = await query.refetch();
    if (result.isSuccess) { setNeedsRefresh(false); share.reset(); withdraw.reset(); }
  }
  return { query, share, withdraw, needsRefresh, refresh };
}
