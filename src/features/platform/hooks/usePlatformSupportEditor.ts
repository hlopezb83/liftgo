import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useState } from "react";
import { updatePlatformSupportFn } from "@/lib/platformSupport.functions";
import type { SupportCase, SupportDetail, SupportUpdate } from "@/lib/platformSupport.types";
import { withSupportRequest } from "@/lib/supportRequest";

export function usePlatformSupportEditor(record: SupportCase, onRefresh: () => Promise<SupportCase>) {
  const cache = useQueryClient();
  const [draft, setDraft] = useState(record);
  const [comment, setComment] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const detailKey = ["platform", "support", "detail", record.id];
  const save = useMutation({ mutationFn: (input: SupportUpdate) => withSupportRequest((signal) => updatePlatformSupportFn({ data: input, signal })),
    retry: false, meta: { silent: true }, onMutate: () => cache.cancelQueries({ queryKey: detailKey }),
    onError: () => setNeedsRefresh(true), onSuccess: (result) => {
      cache.setQueryData<InfiniteData<SupportDetail>>(detailKey, (old) => old && ({ ...old,
        pages: old.pages.map((page, index) => index === 0 ? { ...page, case: result } : page) }));
      setDraft(result); setComment(""); setNeedsRefresh(false);
      void cache.invalidateQueries({ queryKey: ["platform", "support"] });
    } });
  const refresh = useMutation({ mutationFn: onRefresh, retry: false, meta: { silent: true }, onSuccess: () => { setNeedsRefresh(false); save.reset(); } });
  const changed = BigInt(record.revision) > BigInt(draft.revision);
  const pending = save.isPending || refresh.isPending;
  const blocked = pending || changed || needsRefresh;
  function submit() {
    if (blocked) return;
    save.mutate({ caseId: record.id, revision: draft.revision, status: draft.status, severity: draft.severity, assigneeId: draft.assigneeId, comment });
  }
  function loadCurrent() { setDraft(record); setComment(""); save.reset(); }
  return { draft, setDraft, comment, setComment, save, refresh, changed, needsRefresh, pending, blocked, submit, loadCurrent };
}
