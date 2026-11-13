import { useLayoutEffect, useRef, useState } from "react";
import { useUploadDocument } from "@/hooks/useDocuments";
import { getErrorMessage } from "@/lib/errors";
import { notifySuccess } from "@/lib/ui/appFeedback";

type FailedUpload = { file: File; message: string };

/** Owned by a keyed attachment panel: changing entity/identity discards its retry queue. */
export function useDocumentUploadBatch(entityType: string, entityId: string, enabled: boolean) {
  const upload = useUploadDocument();
  const mounted = useRef(false);
  const batch = useRef({ pending: false, failed: [] as FailedUpload[] });
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<FailedUpload[]>([]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = async (files: File[]) => {
    if (!enabled || !mounted.current || batch.current.pending || files.length === 0) return;
    batch.current.pending = true;
    setPending(true);
    const shouldContinue = () => mounted.current;
    const outcomes = await Promise.allSettled(files.map(file =>
      upload.mutateAsync({ file, entityType, entityId, shouldContinue })));
    if (!shouldContinue()) return;
    const failures: FailedUpload[] = [];
    outcomes.forEach((outcome, i) => {
      if (outcome.status === "rejected") failures.push({ file: files[i], message: getErrorMessage(outcome.reason) });
    });
    batch.current = { pending: false, failed: failures };
    setFailed(failures);
    setPending(false);
    const completed = files.length - failures.length;
    if (completed > 0) notifySuccess(`${completed} archivo(s) subido(s)`);
  };

  return {
    pending, failed,
    uploadFiles: (files: File[]) => batch.current.failed.length === 0 ? run(files) : Promise.resolve(),
    retryFailed: () => run(batch.current.failed.map(({ file }) => file)),
    discardFailed: () => {
      if (batch.current.pending) return;
      batch.current.failed = [];
      setFailed([]);
    },
  };
}
