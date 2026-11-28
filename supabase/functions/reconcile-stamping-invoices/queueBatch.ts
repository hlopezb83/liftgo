import {
  groupByOrganization,
  type GroupedByOrganization,
} from "../_shared/orgContext.ts";
import {
  selectCreditNotePdfs,
  selectStuckCreditNotes,
} from "./creditNoteProcessor.ts";
import { selectRepFolios, selectStuckPayments } from "./paymentProcessor.ts";
import type {
  ReconciliationResult,
  SelectionContext,
  StuckInvoice,
} from "./processorTypes.ts";

export type RowRecord = Record<string, unknown>;

export interface GroupedQueues {
  stuck: GroupedByOrganization<StuckInvoice>;
  payments: GroupedByOrganization<RowRecord>;
  ncs: GroupedByOrganization<RowRecord>;
  folioPending: GroupedByOrganization<RowRecord>;
  pdfPending: GroupedByOrganization<RowRecord>;
}

function logErr(label: string, err: unknown): void {
  if (err) console.error(label, err);
}

export async function loadSecondaryQueues(
  selection: SelectionContext,
  stuckAll: StuckInvoice[],
) {
  const pay = await selectStuckPayments(selection);
  logErr("[reconcile-stamping] payments fetch failed", pay.error);
  const folio = await selectRepFolios(selection);
  logErr("[reconcile-stamping] rep folio fetch failed", folio.error);
  const nc = await selectStuckCreditNotes(selection);
  logErr("[reconcile-stamping] credit_notes fetch failed", nc.error);
  const pdf = await selectCreditNotePdfs(selection);
  logErr("[reconcile-stamping] NC PDF selection failed", pdf.error);

  return {
    stuckAll,
    paymentsAll: (pay.data ?? []) as RowRecord[],
    ncsAll: (nc.data ?? []) as RowRecord[],
    folioPendingAll: (folio.data ?? []) as RowRecord[],
    pdfPendingAll: (pdf.error ? [] : pdf.data ?? []) as RowRecord[],
    pdfPendingErr: pdf.error,
  };
}

export function isCompletelyIdle(
  q: Awaited<ReturnType<typeof loadSecondaryQueues>>,
): boolean {
  const count = q.stuckAll.length + q.paymentsAll.length + q.ncsAll.length +
    q.folioPendingAll.length + q.pdfPendingAll.length;
  return count === 0 && !q.pdfPendingErr;
}

export function groupAllQueues(
  q: Awaited<ReturnType<typeof loadSecondaryQueues>>,
): GroupedQueues {
  return {
    stuck: groupByOrganization(q.stuckAll),
    payments: groupByOrganization(q.paymentsAll),
    ncs: groupByOrganization(q.ncsAll),
    folioPending: groupByOrganization(q.folioPendingAll),
    pdfPending: groupByOrganization(q.pdfPendingAll),
  };
}

export function collectOrganizationIds(g: GroupedQueues): Set<string> {
  return new Set<string>([
    ...g.stuck.groups.keys(),
    ...g.payments.groups.keys(),
    ...g.ncs.groups.keys(),
    ...g.folioPending.groups.keys(),
    ...g.pdfPending.groups.keys(),
  ]);
}

export function appendOrphanResults(
  results: ReconciliationResult[],
  g: GroupedQueues,
): void {
  const orphans = [
    ...g.stuck.withoutOrganization,
    ...g.payments.withoutOrganization,
    ...g.ncs.withoutOrganization,
    ...g.folioPending.withoutOrganization,
    ...g.pdfPending.withoutOrganization,
  ];
  for (const orphan of orphans) {
    const id = (orphan as { id?: unknown }).id;
    results.push({
      invoice_id: typeof id === "string" ? id : "unknown",
      status: "skipped_without_organization",
      error: "Documento sin organization_id; no se puede resolver Facturapi",
    });
  }
}

export function appendMisconfiguredOrg(
  results: ReconciliationResult[],
  organizationId: string,
  g: GroupedQueues,
): void {
  const standardMsg = "Facturapi no configurado; no se puede reconciliar";
  const folioMsg =
    "Facturapi no configurado; no se puede recuperar el folio REP";
  const standardRows = [
    ...(g.stuck.groups.get(organizationId) ?? []),
    ...(g.payments.groups.get(organizationId) ?? []),
    ...(g.ncs.groups.get(organizationId) ?? []),
    ...(g.pdfPending.groups.get(organizationId) ?? []),
  ] as Array<{ id: string }>;
  for (const row of standardRows) {
    results.push({
      invoice_id: row.id,
      status: "org_misconfigured",
      error: standardMsg,
      organization_id: organizationId,
    });
  }
  for (const p of g.folioPending.groups.get(organizationId) ?? []) {
    results.push({
      invoice_id: (p as { id: string }).id,
      status: "org_misconfigured",
      error: folioMsg,
      organization_id: organizationId,
    });
  }
}
