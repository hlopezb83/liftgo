// EC-A2 — Cron: recupera facturas atascadas en cfdi_status='stamping'.
// Lo invoca pg_cron cada 5 minutos vía net.http_post (migración
// 20260721000000_retry_queue_cron.sql) con `Authorization: Bearer $CRON_SECRET`.
//
// Escenario: stamp-cfdi persistió facturapi_invoice_id + cfdi_uuid pero antes
// del UPDATE final (descarga XML/PDF + set stamped) el proceso murió/timeout.
// La factura queda en 'stamping' con CFDI ya emitido en Facturapi.
//
// Este cron busca esas filas > 10 min de antigüedad y:
//   1. Descarga XML y PDF desde Facturapi (por facturapi_invoice_id).
//   2. Sube ambos a Supabase Storage.
//   3. SI ambos existen, llama a `reconcile_stamping_invoice` (idempotente)
//      para marcar 'stamped'.
//   4. Si alguna descarga falla, deja la fila en 'stamping' para reintentar
//      en el próximo ciclo — nunca marcamos 'stamped' sin XML (verificación
//      post-verificación §4).
//
// NC-2: exige `x-cron-secret` o `Authorization: Bearer <CRON_SECRET>`.
import { handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/supabaseClients.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";
import {
  createFacturapiClient,
  getFacturapiConfigForOrganization,
} from "../_shared/facturapi/client.ts";
import {
  groupByOrganization,
  resolveCallerOrganization,
} from "../_shared/orgContext.ts";
import { processInvoices, selectStuckInvoices } from "./invoiceProcessor.ts";
import {
  processPaymentComplements,
  selectRepFolios,
  selectStuckPayments,
} from "./paymentProcessor.ts";
import {
  processCreditNotes,
  selectCreditNotePdfs,
  selectStuckCreditNotes,
} from "./creditNoteProcessor.ts";
import type {
  ProcessorContext,
  ReconciliationResult,
  StuckInvoice,
} from "./processorTypes.ts";

// MON-02: presupuesto de reloj por corrida y lotes más chicos. Sin ellos una
// corrida con muchas llamadas al PAC excedía el runtime (504) o moría a media
// ejecución (502). El cron corre cada 5 min y retoma lo que falte.
const RUN_BUDGET_MS = 50_000;
const RUN_ROW_LIMIT = 10;

export async function handleRequest(req: Request): Promise<Response> {
  const RUN_STARTED_AT = Date.now();
  const outOfBudget = () => Date.now() - RUN_STARTED_AT > RUN_BUDGET_MS;
  let truncated = false;
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (b: unknown, status: number) => jsonResponse(req, b, { status });

  // Lote C · DIFF 8 rest: auth timing-safe centralizada en _shared/cronAuth.ts.
  const admin = getAdminClient();
  const auth = await authenticateCronRequest(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  // Multiempresa · Fase 1: ejecución MANUAL (un humano, no pg_cron) se acota
  // a su propia organización. La detectamos por un header explícito que solo
  // agrega un caller confiable (nunca el body, que es del navegador). Sin
  // este header (camino real del cron) se procesan todas las organizaciones
  // con trabajo pendiente, cada una con SUS PROPIAS credenciales.
  const manualCallerUserId = req.headers.get("x-caller-user-id");
  let manualOrganizationId: string | null = null;
  if (manualCallerUserId) {
    const callerOrg = await resolveCallerOrganization(
      admin,
      manualCallerUserId,
    );
    if (!callerOrg.ok) {
      return json({ error: callerOrg.message }, callerOrg.status);
    }
    manualOrganizationId = callerOrg.organizationId;
  }

  const STALE_THRESHOLD_MIN = 10;
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000)
    .toISOString();
  const selection = {
    admin,
    cutoff,
    manualOrganizationId,
    rowLimit: RUN_ROW_LIMIT,
  };

  const { data: rows, error } = await selectStuckInvoices(selection);

  if (error) {
    console.error("[reconcile-stamping] fetch failed", error);
    return json({ error: "Fetch failed" }, 500);
  }

  // N4: consultar TAMBIÉN REP y NC atascados ANTES de decidir si salir —
  // si solo hay pagos o NCs en 'stamping', el cron no debe irse sin
  // procesarlos (deadlock permanente tras un timeout del PAC).
  const { data: stuckPayments, error: payErr } = await selectStuckPayments(
    selection,
  );

  if (payErr) {
    console.error("[reconcile-stamping] payments fetch failed", payErr);
  }

  // Tramo 8.1: pagos YA timbrados que quedaron sin folio interno (p. ej. porque
  // la asignación falló después de que el PAC timbró). No se re-timbran: sólo
  // se recupera el folio, siempre dentro de la organización del propio pago.
  const { data: folioPendingPayments, error: folioErr } = await selectRepFolios(
    selection,
  );

  if (folioErr) {
    console.error("[reconcile-stamping] rep folio fetch failed", folioErr);
  }

  const { data: stuckNcs, error: ncErr } = await selectStuckCreditNotes(
    selection,
  );

  if (ncErr) {
    console.error("[reconcile-stamping] credit_notes fetch failed", ncErr);
  }

  // File-only recovery is independent of fiscal reconciliation. NCs with XML
  // pending, cancellations or missing provider identity stay outside this lane.
  const { data: pdfPendingNcs, error: pdfPendingErr } =
    await selectCreditNotePdfs(selection);
  if (pdfPendingErr) {
    console.error(
      "[reconcile-stamping] NC PDF selection failed",
      pdfPendingErr,
    );
  }
  const pdfPendingAll = (pdfPendingErr ? [] : pdfPendingNcs ?? []) as Array<
    Record<string, unknown>
  >;

  const stuckAll = (rows ?? []) as StuckInvoice[];
  const paymentsAll = (stuckPayments ?? []) as Array<Record<string, unknown>>;
  const ncsAll = (stuckNcs ?? []) as Array<Record<string, unknown>>;
  const folioPendingAll = (folioPendingPayments ?? []) as Array<
    Record<string, unknown>
  >;

  // N4: salir SOLO si las listas están vacías. Con trabajo pendiente,
  // se continúa y se resuelve la config del PAC POR ORGANIZACIÓN (nunca un
  // solo cliente Facturapi compartido entre empresas).
  if (
    stuckAll.length === 0 && paymentsAll.length === 0 && ncsAll.length === 0 &&
    folioPendingAll.length === 0 && pdfPendingAll.length === 0 && !pdfPendingErr
  ) {
    return json({ processed: 0, results: [] }, 200);
  }

  // Multiempresa · Fase 1: agrupar cada colección por organization_id. Las
  // filas sin organización NO se procesan; se reportan aparte.
  const stuckGrouped = groupByOrganization(stuckAll);
  const paymentsGrouped = groupByOrganization(paymentsAll);
  const ncsGrouped = groupByOrganization(ncsAll);
  const folioPendingGrouped = groupByOrganization(folioPendingAll);
  const pdfPendingGrouped = groupByOrganization(pdfPendingAll);

  const organizationIds = new Set<string>([
    ...stuckGrouped.groups.keys(),
    ...paymentsGrouped.groups.keys(),
    ...ncsGrouped.groups.keys(),
    ...folioPendingGrouped.groups.keys(),
    ...pdfPendingGrouped.groups.keys(),
  ]);

  const results: ReconciliationResult[] = [];

  if (pdfPendingErr) {
    results.push({
      invoice_id: "unknown",
      status: "nc_pdf_selection_error",
      error: "No se pudo consultar la cola de PDF de NC",
    });
  }

  // Documentos sin organization_id: no se procesan (no hay forma segura de
  // resolver credenciales), pero se reportan para diagnóstico.
  for (
    const orphan of [
      ...stuckGrouped.withoutOrganization,
      ...paymentsGrouped.withoutOrganization,
      ...ncsGrouped.withoutOrganization,
      ...folioPendingGrouped.withoutOrganization,
      ...pdfPendingGrouped.withoutOrganization,
    ]
  ) {
    const id = (orphan as { id?: unknown }).id;
    results.push({
      invoice_id: typeof id === "string" ? id : "unknown",
      status: "skipped_without_organization",
      error: "Documento sin organization_id; no se puede resolver Facturapi",
    });
  }

  // Reporte por organización, para diagnosticar fallas aisladas sin romper
  // el formato de respuesta existente (`processed`/`truncated`/`results`).
  const organizations: Array<
    { organization_id: string; status: "ok" | "misconfigured"; error?: string }
  > = [];

  for (const organizationId of organizationIds) {
    if (outOfBudget()) {
      truncated = true;
      break;
    }

    // Multiempresa · Fase 1: config y cliente Facturapi EXCLUSIVOS de esta
    // organización. Un fallo aquí NUNCA usa llaves de otra empresa; solo
    // afecta el trabajo pendiente de esta organización.
    let apiKey: string | null = null;
    let mode: "test" | "live" = "test";
    try {
      const cfg = await getFacturapiConfigForOrganization({
        admin,
        env: (k) => Deno.env.get(k),
        organizationId,
      });
      apiKey = cfg.apiKey;
      mode = cfg.mode;
    } catch (err) {
      console.error("[reconcile-stamping] config lookup failed", {
        organization_id: organizationId,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    if (!apiKey) {
      organizations.push({
        organization_id: organizationId,
        status: "misconfigured",
        error: "Facturapi no configurado para esta empresa",
      });
      for (const row of stuckGrouped.groups.get(organizationId) ?? []) {
        results.push({
          invoice_id: row.id,
          status: "org_misconfigured",
          error: "Facturapi no configurado; no se puede reconciliar",
          organization_id: organizationId,
        });
      }
      for (const p of paymentsGrouped.groups.get(organizationId) ?? []) {
        results.push({
          invoice_id: (p as { id: string }).id,
          status: "org_misconfigured",
          error: "Facturapi no configurado; no se puede reconciliar",
          organization_id: organizationId,
        });
      }
      for (
        const nc of [
          ...(ncsGrouped.groups.get(organizationId) ?? []),
          ...(pdfPendingGrouped.groups.get(organizationId) ?? []),
        ]
      ) {
        results.push({
          invoice_id: (nc as { id: string }).id,
          status: "org_misconfigured",
          error: "Facturapi no configurado; no se puede reconciliar",
          organization_id: organizationId,
        });
      }
      for (const p of folioPendingGrouped.groups.get(organizationId) ?? []) {
        results.push({
          invoice_id: (p as { id: string }).id,
          status: "org_misconfigured",
          error: "Facturapi no configurado; no se puede recuperar el folio REP",
          organization_id: organizationId,
        });
      }
      continue;
    }

    organizations.push({ organization_id: organizationId, status: "ok" });
    const client = createFacturapiClient(apiKey);
    const stuck = stuckGrouped.groups.get(organizationId) ?? [];
    const payments = paymentsGrouped.groups.get(organizationId) ?? [];
    const ncs = ncsGrouped.groups.get(organizationId) ?? [];
    const folioPending = folioPendingGrouped.groups.get(organizationId) ?? [];

    const context: ProcessorContext = {
      admin,
      client,
      organizationId,
      mode,
      outOfBudget,
      results,
    };
    // Always invoke each processor in the original order. Do not short-circuit
    // on `truncated`: each lane retains its original per-row budget checks.
    if (await processInvoices(context, stuck)) truncated = true;
    if (await processPaymentComplements(context, payments, folioPending)) {
      truncated = true;
    }
    if (
      await processCreditNotes(
        context,
        ncs,
        pdfPendingGrouped.groups.get(organizationId) ?? [],
      )
    ) truncated = true;
  } // fin del bloque por organización

  return json(
    { processed: results.length, truncated, results, organizations },
    200,
  );
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
