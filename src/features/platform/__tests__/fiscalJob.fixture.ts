import type { FiscalJob, FiscalJobDetail } from "@/lib/platformFiscalJobs.types";
export const fiscalJob: FiscalJob = { id: "96000000-0000-4000-8000-000000000021",
  organizationId: "96000000-0000-4000-8000-000000000011", organizationName: "Empresa fiscal CI",
  documentId: "96000000-0000-4000-8000-000000000031", folio: "FAC-0042", documentStatus: "stamping",
  documentAvailable: true, hasUuid: false, hasProviderId: true, operation: "stamp", revision: "9007199254740993",
  modeAtEnqueue: null, currentMode: "test", createdAt: "2026-10-02T10:00:00Z", observedAt: "2026-10-02T10:01:00Z", removed: false,
  state: { status: "succeeded", attempts: 1, maxAttempts: 5, deferrals: 0, nextRetryAt: "2026-10-02T10:00:00Z", hasError: true } };
export const fiscalJobDetail: FiscalJobDetail = { job: fiscalJob, nextCursor: "9007199254740992", events: [{
  id: "9007199254740993", revision: "1", kind: "snapshot", observedAt: fiscalJob.observedAt, changedFields: [], state: fiscalJob.state,
}] };
