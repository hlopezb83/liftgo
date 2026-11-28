import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { notifyError, notifySuccess, notifyValidation, notifyWarning } from "@/lib/ui/appFeedback";
import { extractErrorDetails } from "@/lib/ui/errorDetailsExtract";
import { performPlatformFiscalActionFn } from "../lib/platformFiscalActions.functions";
import { FISCAL_ACTION_STATUS, type FiscalActionInput } from "../lib/platformFiscalActions.types";
import { platformKeys } from "../lib/queryKeys";
import type { FiscalJob } from "../lib/platformFiscalJobs.types";

export const FISCAL_REASON_MIN_LENGTH = 10;

export function usePlatformFiscalAction(job: FiscalJob) {
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<FiscalActionInput | null>(null);
  const guard = useRef(false);
  async function act(intent: FiscalActionInput["intent"]) {
    if (guard.current) return;
    if (reason.trim().length < FISCAL_REASON_MIN_LENGTH) { notifyValidation({ message: `Escribe un motivo de al menos ${FISCAL_REASON_MIN_LENGTH} caracteres.` }); return; }
    guard.current = true; setBusy(true);
    const input = pending ?? { jobId: job.id, revision: job.revision, requestId: crypto.randomUUID(), intent, reason: reason.trim() };
    setPending(input);
    try {
      const result = await performPlatformFiscalActionFn({ data: input });
      if (["recovered", "retry_scheduled", "cancelled"].includes(result.status)) notifySuccess(FISCAL_ACTION_STATUS[result.status]);
      else notifyWarning(FISCAL_ACTION_STATUS[result.status]);
      if (result.status !== "pending") { setPending(null); setReason(""); }
    } catch (error) {
      const status = extractErrorDetails(error).status;
      if (status && status >= 400 && status < 500) setPending(null);
      notifyError({ error, title: "No se confirmó la consulta fiscal", phase: "mutation", context: { jobId: job.id, requestId: input.requestId } });
    } finally {
      await client.invalidateQueries({ queryKey: platformKeys.fiscalJobs.all });
      guard.current = false; setBusy(false);
    }
  }
  return { reason, setReason, busy, pending, act };
}
