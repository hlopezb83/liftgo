// EC-A2 — Cron: recupera facturas atascadas en cfdi_status='stamping'.
import { handleCors } from "../_shared/cors.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";
import {
  createFacturapiClient,
  getFacturapiConfigForOrganization,
} from "../_shared/facturapi/client.ts";
import { jsonResponse } from "../_shared/http.ts";
import {
  groupByOrganization,
  type GroupedByOrganization,
  resolveCallerOrganization,
} from "../_shared/orgContext.ts";
import { getAdminClient } from "../_shared/supabaseClients.ts";
import {
  processCreditNotes,
  selectCreditNotePdfs,
  selectStuckCreditNotes,
} from "./creditNoteProcessor.ts";
import { processInvoices, selectStuckInvoices } from "./invoiceProcessor.ts";
import {
  processPaymentComplements,
  selectRepFolios,
  selectStuckPayments,
} from "./paymentProcessor.ts";
import type {
  ProcessorContext,
  ReconciliationResult,
  SelectionContext,
  StuckInvoice,
} from "./processorTypes.ts";

const RUN_BUDGET_MS = 50_000;
const RUN_ROW_LIMIT = 10;
const STALE_THRESHOLD_MIN = 10;

type RowRecord = Record<string, unknown>;
type OrgStatus = {
  organization_id: string;
  status: "ok" | "misconfigured";
  error?: string;
};

interface GroupedQueues {
  stuck: GroupedByOrganization<StuckInvoice>;
  payments: GroupedByOrganization<RowRecord>;
  ncs: GroupedByOrganization<RowRecord>;
  folioPending: GroupedByOrganization<RowRecord>;
  pdfPending: GroupedByOrganization<RowRecord>;
}

async function resolveManualOrg(
  req: Request,
  admin: ReturnType<typeof getAdminClient>,
) {
  const manualCallerUserId = req.headers.get("x-caller-user-id");
  if (!manualCallerUserId) return { ok: true as const, organizationId: null };
  const callerOrg = await resolveCallerOrganization(admin, manualCallerUserId);
  if (!callerOrg.ok) {
    return {
      ok: false as const,
      status: callerOrg.status,
      message: callerOrg.message,
    };
  }
  return { ok: true as const, organizationId: callerOrg.organizationId };
}

function logErr(label: string, err: unknown): void {
  if (err) console.error(label, err);
}

async function loadSecondaryQueues(
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

function isCompletelyIdle(
  q: Awaited<ReturnType<typeof loadSecondaryQueues>>,
): boolean {
  const count = q.stuckAll.length + q.paymentsAll.length + q.ncsAll.length +
    q.folioPendingAll.length + q.pdfPendingAll.length;
  return count === 0 && !q.pdfPendingErr;
}

function groupAllQueues(
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

function collectOrganizationIds(g: GroupedQueues): Set<string> {
  return new Set<string>([
    ...g.stuck.groups.keys(),
    ...g.payments.groups.keys(),
    ...g.ncs.groups.keys(),
    ...g.folioPending.groups.keys(),
    ...g.pdfPending.groups.keys(),
  ]);
}

function appendOrphanResults(
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

function appendMisconfiguredOrg(
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

async function resolveOrgFacturapi(
  admin: ReturnType<typeof getAdminClient>,
  organizationId: string,
): Promise<{ apiKey: string | null; mode: "test" | "live" }> {
  try {
    const cfg = await getFacturapiConfigForOrganization({
      admin,
      env: (k) => Deno.env.get(k),
      organizationId,
    });
    return { apiKey: cfg.apiKey, mode: cfg.mode };
  } catch (err) {
    console.error("[reconcile-stamping] config lookup failed", {
      organization_id: organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { apiKey: null, mode: "test" };
  }
}

async function reconcileOrganization(
  admin: ReturnType<typeof getAdminClient>,
  organizationId: string,
  grouped: GroupedQueues,
  outOfBudget: () => boolean,
  results: ReconciliationResult[],
  organizations: OrgStatus[],
): Promise<boolean> {
  const { apiKey, mode } = await resolveOrgFacturapi(admin, organizationId);
  if (!apiKey) {
    organizations.push({
      organization_id: organizationId,
      status: "misconfigured",
      error: "Facturapi no configurado para esta empresa",
    });
    appendMisconfiguredOrg(results, organizationId, grouped);
    return false;
  }

  organizations.push({ organization_id: organizationId, status: "ok" });
  const context: ProcessorContext = {
    admin,
    client: createFacturapiClient(apiKey),
    organizationId,
    mode,
    outOfBudget,
    results,
  };
  const stuck = grouped.stuck.groups.get(organizationId) ?? [];
  const payments = grouped.payments.groups.get(organizationId) ?? [];
  const ncs = grouped.ncs.groups.get(organizationId) ?? [];
  const folioPending = grouped.folioPending.groups.get(organizationId) ?? [];
  const pdfPending = grouped.pdfPending.groups.get(organizationId) ?? [];

  let truncated = false;
  if (await processInvoices(context, stuck)) truncated = true;
  if (await processPaymentComplements(context, payments, folioPending)) {
    truncated = true;
  }
  if (await processCreditNotes(context, ncs, pdfPending)) truncated = true;
  return truncated;
}

export async function handleRequest(req: Request): Promise<Response> {
  const startedAt = Date.now();
  const outOfBudget = () => Date.now() - startedAt > RUN_BUDGET_MS;
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (b: unknown, status: number) => jsonResponse(req, b, { status });

  const admin = getAdminClient();
  const auth = await authenticateCronRequest(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const manualOrg = await resolveManualOrg(req, admin);
  if (!manualOrg.ok) {
    return json({ error: manualOrg.message }, manualOrg.status);
  }

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000)
    .toISOString();
  const selection: SelectionContext = {
    admin,
    cutoff,
    manualOrganizationId: manualOrg.organizationId,
    rowLimit: RUN_ROW_LIMIT,
  };

  const { data: rows, error } = await selectStuckInvoices(selection);
  if (error) {
    console.error("[reconcile-stamping] fetch failed", error);
    return json({ error: "Fetch failed" }, 500);
  }

  const queues = await loadSecondaryQueues(
    selection,
    (rows ?? []) as StuckInvoice[],
  );
  if (isCompletelyIdle(queues)) {
    return json({ processed: 0, results: [] }, 200);
  }

  const grouped = groupAllQueues(queues);
  const results: ReconciliationResult[] = [];
  if (queues.pdfPendingErr) {
    results.push({
      invoice_id: "unknown",
      status: "nc_pdf_selection_error",
      error: "No se pudo consultar la cola de PDF de NC",
    });
  }
  appendOrphanResults(results, grouped);

  const organizations: OrgStatus[] = [];
  let truncated = false;
  for (const organizationId of collectOrganizationIds(grouped)) {
    if (outOfBudget()) {
      truncated = true;
      break;
    }
    if (
      await reconcileOrganization(
        admin,
        organizationId,
        grouped,
        outOfBudget,
        results,
        organizations,
      )
    ) {
      truncated = true;
    }
  }

  return json(
    { processed: results.length, truncated, results, organizations },
    200,
  );
}
