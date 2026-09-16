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
  binaryToBytes,
  binaryToText,
  createFacturapiClient,
  describeFacturapiError,
  getFacturapiConfigForOrganization,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";
import { organizationStoragePath } from "../_shared/storagePath.ts";
import {
  groupByOrganization,
  resolveCallerOrganization,
} from "../_shared/orgContext.ts";
import { assignRepFolio, repFolioPendingMessage } from "../_shared/repFolio.ts";
import type { SupabaseLike } from "../_shared/types.ts";

import {
  decideLookupOutcome,
  decideRowAction,
  decideXmlFailure,
  MAX_LOOKUP_MISSES,
  MAX_STAMPING_ATTEMPTS,
  type PacLookup,
  type StuckRow as PureStuckRow,
} from "./decisions.ts";

interface StuckRow extends PureStuckRow {
  organization_id: string;
  serie: string | null;
  folio: string | null;
  updated_at: string;
}

// MON-02: presupuesto de reloj por corrida y lotes más chicos. Sin ellos una
// corrida con muchas llamadas al PAC excedía el runtime (504) o moría a media
// ejecución (502). El cron corre cada 5 min y retoma lo que falte.
export const RUN_BUDGET_MS = 50_000;
export const RUN_ROW_LIMIT = 10;

/**
 * Tramo 8.1: recuperación idempotente del folio REP de un pago ya timbrado.
 * Devuelve el `status` a reportar, o `null` si no había nada que recuperar.
 * La organización proviene SIEMPRE de la fila del pago, nunca de un parámetro
 * de la petición.
 */
async function recoverRepFolio(
  // El cliente real de supabase-js es estructuralmente más amplio que
  // `SupabaseLike`; se estrecha al pasarlo al helper compartido.
  // deno-lint-ignore no-explicit-any
  admin: any,
  client: { invoices: { retrieve?: (id: string) => Promise<unknown> } },
  payment: Record<string, unknown>,
  facturapiId: string,
): Promise<string | null> {
  const paymentId = payment.id as string;
  if (payment.rep_number) return null; // ya tiene folio: nada que hacer

  let folio: unknown = payment.rep_folio ?? null;
  if (!folio) {
    const retrieve = client.invoices.retrieve;
    if (typeof retrieve !== "function") return "rep_folio_pending";
    try {
      const inv = await retryOnFacturapi5xx(() =>
        retrieve.call(client.invoices, facturapiId) as Promise<unknown>
      );
      folio = (inv as { folio_number?: unknown }).folio_number ?? null;
    } catch (err) {
      console.error("[reconcile-stamping] REP folio lookup failed", {
        payment_id: paymentId,
        err: describeFacturapiError(err).message,
      });
      return "rep_folio_pending";
    }
  }

  const res = await assignRepFolio(admin, {
    paymentId,
    organizationId: payment.organization_id as string | null,
    folio: folio as string | number | null,
  });
  if (res.ok) return "rep_folio_recovered";

  console.error("[reconcile-stamping] REP folio assignment failed", {
    payment_id: paymentId,
    code: res.code,
    err: res.message,
  });
  await admin.from("payments")
    .update({ rep_error_message: repFolioPendingMessage(res.message) })
    .eq("id", paymentId);
  return "rep_folio_pending";
}

async function handleRequest(req: Request): Promise<Response> {
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

  let invoicesQuery = admin
    .from("invoices")
    .select(
      "id, organization_id, cfdi_uuid, facturapi_invoice_id, serie, folio, updated_at, stamping_attempts",
    )
    .eq("cfdi_status", "stamping")
    .lt("updated_at", cutoff)
    .limit(RUN_ROW_LIMIT);
  if (manualOrganizationId) {
    invoicesQuery = invoicesQuery.eq("organization_id", manualOrganizationId);
  }
  const { data: rows, error } = await invoicesQuery;

  if (error) {
    console.error("[reconcile-stamping] fetch failed", error);
    return json({ error: "Fetch failed" }, 500);
  }

  // N4: consultar TAMBIÉN REP y NC atascados ANTES de decidir si salir —
  // si solo hay pagos o NCs en 'stamping', el cron no debe irse sin
  // procesarlos (deadlock permanente tras un timeout del PAC).
  let paymentsQuery = admin
    .from("payments")
    .select(
      "id, organization_id, invoice_id, rep_cfdi_uuid, rep_facturapi_id, rep_stamping_started_at, rep_lookup_attempts, rep_stamping_attempts, rep_number, rep_folio",
    )
    .eq("rep_cfdi_status", "stamping")
    .lt("rep_stamping_started_at", cutoff)
    .limit(RUN_ROW_LIMIT);
  if (manualOrganizationId) {
    paymentsQuery = paymentsQuery.eq("organization_id", manualOrganizationId);
  }
  const { data: stuckPayments, error: payErr } = await paymentsQuery;

  if (payErr) {
    console.error("[reconcile-stamping] payments fetch failed", payErr);
  }

  // Tramo 8.1: pagos YA timbrados que quedaron sin folio interno (p. ej. porque
  // la asignación falló después de que el PAC timbró). No se re-timbran: sólo
  // se recupera el folio, siempre dentro de la organización del propio pago.
  let folioPendingQuery = admin
    .from("payments")
    .select(
      "id, organization_id, invoice_id, rep_facturapi_id, rep_number, rep_folio",
    )
    .eq("rep_cfdi_status", "stamped")
    .is("rep_number", null)
    .not("rep_facturapi_id", "is", null)
    .limit(RUN_ROW_LIMIT);
  if (manualOrganizationId) {
    folioPendingQuery = folioPendingQuery.eq(
      "organization_id",
      manualOrganizationId,
    );
  }
  const { data: folioPendingPayments, error: folioErr } =
    await folioPendingQuery;

  if (folioErr) {
    console.error("[reconcile-stamping] rep folio fetch failed", folioErr);
  }


  let creditNotesQuery = admin
    .from("credit_notes")
    .select(
      "id, organization_id, cfdi_uuid, facturapi_invoice_id, updated_at, lookup_attempts, stamping_attempts",
    )
    .eq("cfdi_status", "stamping")
    .lt("updated_at", cutoff)
    .limit(RUN_ROW_LIMIT);
  if (manualOrganizationId) {
    creditNotesQuery = creditNotesQuery.eq(
      "organization_id",
      manualOrganizationId,
    );
  }
  const { data: stuckNcs, error: ncErr } = await creditNotesQuery;

  if (ncErr) {
    console.error("[reconcile-stamping] credit_notes fetch failed", ncErr);
  }

  const stuckAll = (rows ?? []) as StuckRow[];
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
    folioPendingAll.length === 0
  ) {
    return json({ processed: 0, results: [] }, 200);
  }

  // Multiempresa · Fase 1: agrupar cada colección por organization_id. Las
  // filas sin organización NO se procesan; se reportan aparte.
  const stuckGrouped = groupByOrganization(stuckAll);
  const paymentsGrouped = groupByOrganization(paymentsAll);
  const ncsGrouped = groupByOrganization(ncsAll);
  const folioPendingGrouped = groupByOrganization(folioPendingAll);

  const organizationIds = new Set<string>([
    ...stuckGrouped.groups.keys(),
    ...paymentsGrouped.groups.keys(),
    ...ncsGrouped.groups.keys(),
    ...folioPendingGrouped.groups.keys(),
  ]);


  // N-29: claim optimista por fila. Dos ejecuciones concurrentes del cron
  // (o un reintento manual encimado) podían procesar el mismo documento y
  // duplicar llamadas al PAC. El UPDATE condicionado al valor leído del
  // timestamp deja pasar sólo a la primera; la segunda salta la fila.
  const claimRow = async (
    table: string,
    id: string,
    tsColumn: string,
    tsValue: unknown,
  ): Promise<boolean> => {
    if (typeof tsValue !== "string") return true;
    const { data } = await admin.from(table)
      .update({ [tsColumn]: new Date().toISOString() })
      .eq("id", id)
      .eq(tsColumn, tsValue)
      .select("id")
      .maybeSingle();
    return Boolean(data);
  };

  const results: Array<
    {
      invoice_id: string;
      status: string;
      error?: string;
      organization_id?: string;
    }
  > = [];

  // Documentos sin organization_id: no se procesan (no hay forma segura de
  // resolver credenciales), pero se reportan para diagnóstico.
  for (
    const orphan of [
      ...stuckGrouped.withoutOrganization,
      ...paymentsGrouped.withoutOrganization,
      ...ncsGrouped.withoutOrganization,
      ...folioPendingGrouped.withoutOrganization,
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
      for (const nc of ncsGrouped.groups.get(organizationId) ?? []) {
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


    for (const row of stuck) {
      if (outOfBudget()) {
        truncated = true;
        break;
      }
      if (!(await claimRow("invoices", row.id, "updated_at", row.updated_at))) {
        results.push({ invoice_id: row.id, status: "claimed_by_other_run" });
        continue;
      }
      if (!row.facturapi_invoice_id || !row.cfdi_uuid) {
        // R12-B2 / TESTS-ARQ2 DIFF 2: la decisión (recover vs retry vs revert)
        // vive en `decisions.ts`; aquí solo materializamos la consulta al PAC y
        // aplicamos la acción resuelta.
        let pac: PacLookup = { kind: "miss" };
        try {
          const listFn = (client.invoices as unknown as {
            list?: (q: Record<string, unknown>) => Promise<unknown>;
          }).list;
          if (typeof listFn === "function") {
            const res = await retryOnFacturapi5xx(() =>
              listFn.call(client.invoices, { q: row.id, limit: 5 }) as Promise<
                unknown
              >
            );
            const data = ((res as { data?: unknown }).data ?? []) as Array<
              Record<string, unknown>
            >;
            // Match estricto: external_id === row.id.
            const hit = data.find((d) =>
              String((d as { external_id?: unknown }).external_id ?? "") ===
                row.id
            );
            if (
              hit && typeof hit.id === "string" && typeof hit.uuid === "string"
            ) {
              pac = { kind: "hit", facturapi_id: hit.id, uuid: hit.uuid };
            }
          } else {
            // N5: el SDK no expone invoices.list → NO es un "miss" (nunca se
            // consultó al PAC). lookup_failed: difiere sin consumir el
            // presupuesto de misses y jamás revierte sin haber consultado.
            pac = { kind: "lookup_failed" };
          }
        } catch (err) {
          console.error("[reconcile-stamping] lookup by external_id failed", {
            invoice_id: row.id,
            err: describeFacturapiError(err).message,
          });
          pac = { kind: "lookup_failed" };
        }

        const action = decideRowAction(row, pac);
        if (action.kind === "recover") {
          // Persistir los ids recuperados y dejar que el siguiente ciclo
          // baje el XML/PDF y ejecute reconcile_stamping_invoice.
          await admin.from("invoices")
            .update({
              facturapi_invoice_id: action.facturapi_id,
              cfdi_uuid: action.uuid,
            })
            .eq("id", row.id);
          results.push({ invoice_id: row.id, status: "recovered_from_pac" });
          continue;
        }
        if (action.kind === "retry_lookup") {
          // N9: solo un miss REAL consume el presupuesto de intentos; un
          // lookup_failed (PAC caído / SDK sin list) difiere SIN bump — si no,
          // 10 ciclos de PAC caído agotaban el presupuesto y el primer miss
          // real revertía a 'error' de inmediato.
          if (action.consume_attempt) {
            await admin.from("invoices")
              .update({ stamping_attempts: (row.stamping_attempts ?? 0) + 1 })
              .eq("id", row.id);
          }
          results.push({ invoice_id: row.id, status: "pac_lookup_deferred" });
          continue;
        }
        // revert_error: PAC confirmó reiteradamente que no existe (sin uuid).
        await admin.from("invoices")
          .update({
            cfdi_status: "error",
            stamping_attempts: (row.stamping_attempts ?? 0) + 1,
            cfdi_error_message:
              "Timbrado interrumpido sin datos de Facturapi. Revisar en el portal de Facturapi antes de retimbrar.",
          })
          .eq("id", row.id);
        results.push({
          invoice_id: row.id,
          status: "reverted_to_error",
          error: "no facturapi_invoice_id",
        });
        continue;
      }

      try {
        let cfdiXml: string | null = null;
        let xmlPath: string | null = null;
        let pdfPath: string | null = null;
        let xmlError: string | null = null;
        let pdfError: string | null = null;

        try {
          cfdiXml = await binaryToText(
            await retryOnFacturapi5xx(() =>
              client.invoices.downloadXml(row.facturapi_invoice_id!)
            ),
          );
          const path = organizationStoragePath(
            row.organization_id,
            `${row.id}/${row.cfdi_uuid}.xml`,
          );
          const { error: upErr } = await admin.storage.from("cfdi-files")
            .upload(
              path,
              new Blob([cfdiXml], { type: "application/xml" }),
              { contentType: "application/xml", upsert: true },
            );
          if (upErr) {
            xmlError = (upErr as { message?: string }).message ?? String(upErr);
          } else {
            xmlPath = path;
          }
        } catch (err) {
          xmlError = describeFacturapiError(err).message;
          console.error("[reconcile-stamping] xml download failed", {
            invoice_id: row.id,
            err: xmlError,
          });
        }

        try {
          const pdfBytes = await binaryToBytes(
            await retryOnFacturapi5xx(() =>
              client.invoices.downloadPdf(row.facturapi_invoice_id!)
            ),
          );
          const path = organizationStoragePath(
            row.organization_id,
            `${row.id}/${row.cfdi_uuid}.pdf`,
          );
          const { error: upErr } = await admin.storage.from("cfdi-files")
            .upload(
              path,
              pdfBytes,
              { contentType: "application/pdf", upsert: true },
            );
          if (upErr) {
            pdfError = (upErr as { message?: string }).message ?? String(upErr);
          } else {
            pdfPath = path;
          }
        } catch (err) {
          pdfError = describeFacturapiError(err).message;
          console.error("[reconcile-stamping] pdf download failed", {
            invoice_id: row.id,
            err: pdfError,
          });
        }

        // Verificación §4: NUNCA marcar `stamped` sin XML. Sin XML la factura
        // queda fiscalmente incompleta (obligatorio para SAT). Bump del
        // contador; si superamos MAX_STAMPING_ATTEMPTS revertimos a 'error'
        // para forzar revisión manual.
        if (!cfdiXml || !xmlPath) {
          const attempts = (row.stamping_attempts ?? 0) + 1;
          // FIX-R3-02: política de reintentos en una sola fuente (decisions.ts).
          const exhausted =
            decideXmlFailure(row.stamping_attempts) === "mark_error";
          await admin.from("invoices")
            .update({
              ...(exhausted
                ? {
                  // H6: estado RECUPERABLE. El CFDI YA existe ante el SAT (hay
                  // facturapi_invoice_id + cfdi_uuid persistidos). Marcar
                  // 'error' con uuid dejaba el CFDI incancelable e
                  // inre-timbrable. 'stamped' + cfdi_xml_pending permite
                  // cancelar (cancel-cfdi exige 'stamped') y documenta que el
                  // XML debe subirse manualmente desde el portal del PAC.
                  cfdi_status: "stamped",
                  cfdi_xml_pending: true,
                  cfdi_error_message:
                    `Reconcile: CFDI timbrado pero la descarga de XML falló tras ${attempts} intentos (${
                      xmlError ?? "sin detalle"
                    }). Sube el XML/PDF manualmente desde el portal de Facturapi y limpia cfdi_xml_pending.`,
                }
                : {
                  cfdi_error_message:
                    `Reconcile: descarga de XML falló (intento ${attempts}/${MAX_STAMPING_ATTEMPTS}): ${
                      xmlError ?? "sin detalle"
                    }. Se reintentará automáticamente.`,
                }),
              stamping_attempts: attempts,
            })
            .eq("id", row.id);
          results.push({
            invoice_id: row.id,
            status: exhausted ? "stamped_xml_pending_manual" : "xml_pending",
            error: xmlError ?? undefined,
          });
          continue;
        }

        // 4. RPC idempotente — solo con el XML ya descargado.
        const { error: rpcErr } = await admin.rpc(
          "reconcile_stamping_invoice",
          {
            p_invoice_id: row.id,
            p_facturapi_invoice_id: row.facturapi_invoice_id,
            p_cfdi_uuid: row.cfdi_uuid,
            p_xml_storage_path: xmlPath,
            p_pdf_storage_path: pdfPath,
            p_cfdi_xml: cfdiXml,
            p_serie: row.serie,
            p_folio: row.folio,
            p_facturapi_env: mode === "live" ? "live" : "test",
          },
        );

        if (rpcErr) {
          results.push({
            invoice_id: row.id,
            status: "rpc_error",
            error: (rpcErr as { message?: string }).message ?? String(rpcErr),
          });
        } else {
          results.push({
            invoice_id: row.id,
            status: "reconciled",
            error: pdfError ?? undefined,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[reconcile-stamping] unexpected", {
          invoice_id: row.id,
          err: msg,
        });
        results.push({ invoice_id: row.id, status: "exception", error: msg });
      }
    }

    // ── H4: reconciliación de COMPLEMENTOS DE PAGO (REP) ─────────────────────
    // Mismo patrón que invoices: payments atascados en rep_cfdi_status='stamping'
    // tras un timeout del PAC. Sin esto, el claim stale re-timbraba un duplicado.
    // N4: la consulta se movió ARRIBA del early return (bloque inicial).
    for (const p of payments) {
      if (outOfBudget()) {
        truncated = true;
        break;
      }
      const paymentId = p.id as string;
      if (
        !(await claimRow(
          "payments",
          paymentId,
          "rep_stamping_started_at",
          p.rep_stamping_started_at,
        ))
      ) {
        results.push({ invoice_id: paymentId, status: "claimed_by_other_run" });
        continue;
      }

      let facturapiId = p.rep_facturapi_id as string | null;
      let repUuid = p.rep_cfdi_uuid as string | null;

      // R12-B2 (payments): sin ids persistidos, lookup al PAC por external_id.
      if (!facturapiId || !repUuid) {
        let pac: PacLookup = { kind: "miss" };
        try {
          const listFn = (client.invoices as unknown as {
            list?: (q: Record<string, unknown>) => Promise<unknown>;
          }).list;
          if (typeof listFn === "function") {
            const res = await retryOnFacturapi5xx(() =>
              listFn.call(client.invoices, {
                q: paymentId,
                limit: 5,
              }) as Promise<
                unknown
              >
            );
            const data = ((res as { data?: unknown }).data ?? []) as Array<
              Record<string, unknown>
            >;
            const hit = data.find((d) =>
              String((d as { external_id?: unknown }).external_id ?? "") ===
                paymentId
            );
            if (
              hit && typeof hit.id === "string" && typeof hit.uuid === "string"
            ) {
              pac = { kind: "hit", facturapi_id: hit.id, uuid: hit.uuid };
            }
          } else {
            // N5: SDK sin invoices.list → lookup_failed (nunca revertir sin
            // haber consultado al PAC).
            pac = { kind: "lookup_failed" };
          }
        } catch (err) {
          pac = { kind: "lookup_failed" };
          console.error("[reconcile-stamping] REP lookup failed", {
            payment_id: paymentId,
            err: describeFacturapiError(err).message,
          });
        }
        // N5/N9: la decisión (recover / defer / revert) vive en decisions.ts.
        const lookupAttempts = p.rep_lookup_attempts as number | null;
        const outcome = decideLookupOutcome(pac, lookupAttempts);
        if (outcome.kind === "recover") {
          facturapiId = outcome.facturapi_id;
          repUuid = outcome.uuid;
          await admin.from("payments")
            .update({
              rep_facturapi_id: facturapiId,
              rep_cfdi_uuid: repUuid,
              rep_lookup_attempts: 0, // racha de misses consecutivos: reset
            })
            .eq("id", paymentId);
        } else if (outcome.kind === "defer") {
          // N9: solo un miss REAL incrementa el contador; lookup_failed no.
          if (outcome.consume_attempt) {
            await admin.from("payments")
              .update({ rep_lookup_attempts: (lookupAttempts ?? 0) + 1 })
              .eq("id", paymentId);
          }
          // PAC no respondió o aún no indexa: reintentar el próximo ciclo.
          results.push({
            invoice_id: paymentId,
            status: "rep_lookup_deferred",
          });
          continue;
        } else {
          // N5: revert SOLO tras MAX_LOOKUP_MISSES misses consecutivos con el
          // PAC respondiendo (antes: al primer miss → re-timbrado → CFDI
          // tipo P duplicado ante el SAT).
          await admin.from("payments")
            .update({
              rep_cfdi_status: "error",
              rep_stamping_started_at: null,
              rep_lookup_attempts: (lookupAttempts ?? 0) + 1,
              rep_error_message:
                `Timbrado de REP interrumpido; Facturapi confirmó ${MAX_LOOKUP_MISSES} veces que el CFDI no existe. Puedes reintentar el timbrado.`,
            })
            .eq("id", paymentId);
          results.push({
            invoice_id: paymentId,
            status: "rep_reverted_to_error",
          });
          continue;
        }
      }

      // Con ids: descargar XML/PDF y marcar stamped (idempotente).
      try {
        let xmlPath: string | null = null;
        let pdfPath: string | null = null;
        try {
          const xmlTxt = await binaryToText(
            await retryOnFacturapi5xx(() =>
              client.invoices.downloadXml(facturapiId!)
            ),
          );
          const path = organizationStoragePath(
            p.organization_id,
            `${p.invoice_id}/rep-${repUuid}.xml`,
          );
          const { error: upErr } = await admin.storage.from("cfdi-files")
            .upload(
              path,
              new Blob([xmlTxt], { type: "application/xml" }),
              { contentType: "application/xml", upsert: true },
            );
          if (!upErr) xmlPath = path;
        } catch (err) {
          console.error("[reconcile-stamping] REP xml failed", {
            payment_id: paymentId,
            err: describeFacturapiError(err).message,
          });
        }
        try {
          const pdfBytes = await binaryToBytes(
            await retryOnFacturapi5xx(() =>
              client.invoices.downloadPdf(facturapiId!)
            ),
          );
          const path = organizationStoragePath(
            p.organization_id,
            `${p.invoice_id}/rep-${repUuid}.pdf`,
          );
          const { error: upErr } = await admin.storage.from("cfdi-files")
            .upload(
              path,
              pdfBytes,
              { contentType: "application/pdf", upsert: true },
            );
          if (!upErr) pdfPath = path;
        } catch (err) {
          console.error("[reconcile-stamping] REP pdf failed", {
            payment_id: paymentId,
            err: describeFacturapiError(err).message,
          });
        }
        // Nunca marcar stamped sin XML (misma regla que invoices): reintentar.
        if (!xmlPath) {
          // B-15: presupuesto de reintentos como en invoices (H6) — antes un REP
          // cuyo XML nunca se podía descargar reintentaba POR SIEMPRE. Tras
          // MAX_STAMPING_ATTEMPTS se marca stamped + rep_xml_pending (el CFDI ya
          // existe ante el SAT; el XML se sube manualmente desde el portal del
          // PAC) para que salga de la cola.
          const attempts = ((p.rep_stamping_attempts as number | null) ?? 0) +
            1;
          const exhausted = decideXmlFailure(
            p.rep_stamping_attempts as number | null,
          ) === "mark_error";
          await admin.from("payments")
            .update({
              ...(exhausted
                ? {
                  rep_cfdi_status: "stamped",
                  rep_stamping_started_at: null,
                  rep_xml_pending: true,
                  rep_error_message:
                    `Reconcile: REP timbrado pero la descarga de XML falló tras ${attempts} intentos. Sube el XML/PDF manualmente desde el portal de Facturapi y limpia rep_xml_pending.`,
                }
                : {
                  rep_error_message:
                    `Reconcile: descarga de XML del REP falló (intento ${attempts}/${MAX_STAMPING_ATTEMPTS}). Se reintentará automáticamente.`,
                }),
              rep_stamping_attempts: attempts,
            })
            .eq("id", paymentId);
          results.push({
            invoice_id: paymentId,
            status: exhausted
              ? "rep_stamped_xml_pending_manual"
              : "rep_xml_pending",
          });
          continue;
        }
        await admin.from("payments")
          .update({
            rep_cfdi_status: "stamped",
            rep_stamping_started_at: null,
            rep_xml_url: xmlPath,
            rep_pdf_url: pdfPath,
            rep_error_message: null,
            rep_lookup_attempts: 0,
            rep_stamping_attempts: 0,
            rep_xml_pending: false,
          })
          .eq("id", paymentId);
        // Tramo 8.1: recuperar pagos ya timbrados que quedaron SIN folio
        // interno. Siempre dentro de la organización del propio pago y de forma
        // idempotente (la RPC devuelve el folio existente si ya coincide).
        const folioStatus = await recoverRepFolio(
          admin,
          client,
          p,
          facturapiId!,
        );
        results.push({
          invoice_id: paymentId,
          status: folioStatus ?? "rep_reconciled",
        });

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[reconcile-stamping] REP unexpected", {
          payment_id: paymentId,
          err: msg,
        });
        results.push({
          invoice_id: paymentId,
          status: "rep_exception",
          error: msg,
        });
      }
    }

    // ── Tramo 8.1: pagos ya timbrados SIN folio interno ─────────────────────
    // Recuperación idempotente: nunca se vuelve a timbrar (el CFDI ya existe),
    // sólo se asigna el folio dentro de la organización del propio pago.
    for (const p of folioPending) {
      if (outOfBudget()) {
        truncated = true;
        break;
      }
      const paymentId = (p as { id: string }).id;
      const facturapiId = (p as { rep_facturapi_id?: unknown })
        .rep_facturapi_id;
      if (typeof facturapiId !== "string" || !facturapiId) {
        results.push({
          invoice_id: paymentId,
          status: "rep_folio_pending",
          organization_id: organizationId,
        });
        continue;
      }
      try {
        const status = await recoverRepFolio(admin, client, p, facturapiId);
        results.push({
          invoice_id: paymentId,
          status: status ?? "rep_folio_already_assigned",
          organization_id: organizationId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[reconcile-stamping] REP folio unexpected", {
          payment_id: paymentId,
          err: msg,
        });
        results.push({
          invoice_id: paymentId,
          status: "rep_folio_exception",
          error: msg,
          organization_id: organizationId,
        });
      }
    }



    // ── H5: reconciliación de NOTAS DE CRÉDITO ───────────────────────────────
    // El claim de stamp-credit-note solo admite pending|error y nada reconciliaba
    // credit_notes: una NC en 'stamping' tras timeout quedaba ingestionable.
    // N4: la consulta se movió ARRIBA del early return (bloque inicial).
    for (const nc of ncs) {
      if (outOfBudget()) {
        truncated = true;
        break;
      }
      const ncId = nc.id as string;
      if (
        !(await claimRow("credit_notes", ncId, "updated_at", nc.updated_at))
      ) {
        results.push({ invoice_id: ncId, status: "claimed_by_other_run" });
        continue;
      }
      let facturapiId = nc.facturapi_invoice_id as string | null;
      let ncUuid = nc.cfdi_uuid as string | null;

      if (!facturapiId || !ncUuid) {
        let pac: PacLookup = { kind: "miss" };
        try {
          const listFn = (client.invoices as unknown as {
            list?: (q: Record<string, unknown>) => Promise<unknown>;
          }).list;
          if (typeof listFn === "function") {
            const res = await retryOnFacturapi5xx(() =>
              listFn.call(client.invoices, { q: ncId, limit: 5 }) as Promise<
                unknown
              >
            );
            const data = ((res as { data?: unknown }).data ?? []) as Array<
              Record<string, unknown>
            >;
            const hit = data.find((d) =>
              String((d as { external_id?: unknown }).external_id ?? "") ===
                ncId
            );
            if (
              hit && typeof hit.id === "string" && typeof hit.uuid === "string"
            ) {
              pac = { kind: "hit", facturapi_id: hit.id, uuid: hit.uuid };
            }
          } else {
            // N5: SDK sin invoices.list → lookup_failed (nunca revertir sin
            // haber consultado al PAC).
            pac = { kind: "lookup_failed" };
          }
        } catch (err) {
          pac = { kind: "lookup_failed" };
          console.error("[reconcile-stamping] NC lookup failed", {
            credit_note_id: ncId,
            err: describeFacturapiError(err).message,
          });
        }
        // N5/N9: la decisión (recover / defer / revert) vive en decisions.ts.
        const lookupAttempts = nc.lookup_attempts as number | null;
        const outcome = decideLookupOutcome(pac, lookupAttempts);
        if (outcome.kind === "recover") {
          facturapiId = outcome.facturapi_id;
          ncUuid = outcome.uuid;
          await admin.from("credit_notes")
            .update({
              facturapi_invoice_id: facturapiId,
              cfdi_uuid: ncUuid,
              lookup_attempts: 0, // racha de misses consecutivos: reset
            })
            .eq("id", ncId);
        } else if (outcome.kind === "defer") {
          // N9: solo un miss REAL incrementa el contador; lookup_failed no.
          if (outcome.consume_attempt) {
            await admin.from("credit_notes")
              .update({ lookup_attempts: (lookupAttempts ?? 0) + 1 })
              .eq("id", ncId);
          }
          results.push({ invoice_id: ncId, status: "nc_lookup_deferred" });
          continue;
        } else {
          // N5: revert SOLO tras MAX_LOOKUP_MISSES misses consecutivos con el
          // PAC respondiendo (el claim vuelve a admitir pending|error).
          await admin.from("credit_notes")
            .update({
              cfdi_status: "error",
              lookup_attempts: (lookupAttempts ?? 0) + 1,
              cfdi_error_message:
                `Timbrado de NC interrumpido; Facturapi confirmó ${MAX_LOOKUP_MISSES} veces que el CFDI no existe. Puedes reintentar el timbrado.`,
            })
            .eq("id", ncId);
          results.push({ invoice_id: ncId, status: "nc_reverted_to_error" });
          continue;
        }
      }

      try {
        let xmlPath: string | null = null;
        let pdfPath: string | null = null;
        try {
          const xml = await binaryToText(
            await retryOnFacturapi5xx(() =>
              client.invoices.downloadXml(facturapiId!)
            ),
          );
          const path = organizationStoragePath(
            nc.organization_id,
            `credit-notes/${ncId}/${ncUuid}.xml`,
          );
          const { error: upErr } = await admin.storage.from("cfdi-files")
            .upload(
              path,
              new Blob([xml], { type: "application/xml" }),
              { contentType: "application/xml", upsert: true },
            );
          if (!upErr) xmlPath = path;
        } catch (err) {
          console.error("[reconcile-stamping] NC xml failed", {
            credit_note_id: ncId,
            err: describeFacturapiError(err).message,
          });
        }
        try {
          const bytes = await binaryToBytes(
            await retryOnFacturapi5xx(() =>
              client.invoices.downloadPdf(facturapiId!)
            ),
          );
          const path = organizationStoragePath(
            nc.organization_id,
            `credit-notes/${ncId}/${ncUuid}.pdf`,
          );
          const { error: upErr } = await admin.storage.from("cfdi-files")
            .upload(
              path,
              bytes,
              { contentType: "application/pdf", upsert: true },
            );
          if (!upErr) pdfPath = path;
        } catch (err) {
          console.error("[reconcile-stamping] NC pdf failed", {
            credit_note_id: ncId,
            err: describeFacturapiError(err).message,
          });
        }
        if (!xmlPath) {
          // B-15: presupuesto de reintentos como en invoices (H6) — antes una NC
          // cuyo XML nunca se podía descargar reintentaba POR SIEMPRE. Tras
          // MAX_STAMPING_ATTEMPTS se marca stamped + cfdi_xml_pending (el CFDI ya
          // existe ante el SAT y cancel-credit-note exige 'stamped'; el XML se
          // sube manualmente desde el portal del PAC) para que salga de la cola.
          const attempts = ((nc.stamping_attempts as number | null) ?? 0) + 1;
          const exhausted = decideXmlFailure(
            nc.stamping_attempts as number | null,
          ) === "mark_error";
          await admin.from("credit_notes")
            .update({
              ...(exhausted
                ? {
                  cfdi_status: "stamped",
                  status: "stamped",
                  cfdi_xml_pending: true,
                  cfdi_error_message:
                    `Reconcile: NC timbrada pero la descarga de XML falló tras ${attempts} intentos. Sube el XML/PDF manualmente desde el portal de Facturapi y limpia cfdi_xml_pending.`,
                }
                : {
                  cfdi_error_message:
                    `Reconcile: descarga de XML de la NC falló (intento ${attempts}/${MAX_STAMPING_ATTEMPTS}). Se reintentará automáticamente.`,
                }),
              stamping_attempts: attempts,
            })
            .eq("id", ncId);
          results.push({
            invoice_id: ncId,
            status: exhausted
              ? "nc_stamped_xml_pending_manual"
              : "nc_xml_pending",
          });
          continue;
        }
        await admin.from("credit_notes")
          .update({
            cfdi_status: "stamped",
            status: "stamped",
            cfdi_xml_url: xmlPath,
            cfdi_pdf_url: pdfPath,
            cfdi_error_message: null,
            lookup_attempts: 0,
            stamping_attempts: 0,
            cfdi_xml_pending: false,
          })
          .eq("id", ncId);
        results.push({ invoice_id: ncId, status: "nc_reconciled" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[reconcile-stamping] NC unexpected", {
          credit_note_id: ncId,
          err: msg,
        });
        results.push({ invoice_id: ncId, status: "nc_exception", error: msg });
      }
    }
  } // fin del bloque por organización

  return json(
    { processed: results.length, truncated, results, organizations },
    200,
  );
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
