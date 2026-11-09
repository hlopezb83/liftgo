import {
  binaryToBytes,
  binaryToText,
  describeFacturapiError,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";
import { organizationStoragePath } from "../_shared/storagePath.ts";
import { lookupPacInvoice } from "../_shared/facturapi/invoiceRecovery.ts";
import type { ProcessorContext, SelectionContext } from "./processorTypes.ts";
import type { DocumentRow } from "./processorTypes.ts";
import { assignRepFolio, repFolioPendingMessage } from "../_shared/repFolio.ts";
import {
  decideLookupOutcome,
  decideXmlFailure,
  MAX_LOOKUP_MISSES,
  MAX_STAMPING_ATTEMPTS,
  type PacLookup,
} from "./decisions.ts";

export async function selectStuckPayments({
  admin,
  cutoff,
  manualOrganizationId,
  rowLimit,
}: SelectionContext) {
  let paymentsQuery = admin
    .from("payments")
    .select(
      "id, organization_id, invoice_id, rep_cfdi_uuid, rep_facturapi_id, rep_stamping_started_at, rep_lookup_attempts, rep_stamping_attempts, rep_number, rep_folio",
    )
    .eq("rep_cfdi_status", "stamping")
    .lt("rep_stamping_started_at", cutoff)
    .limit(rowLimit);
  if (manualOrganizationId) {
    paymentsQuery = paymentsQuery.eq("organization_id", manualOrganizationId);
  }
  return await paymentsQuery;
}

export async function selectRepFolios({
  admin,
  manualOrganizationId,
  rowLimit,
}: SelectionContext) {
  let folioPendingQuery = admin
    .from("payments")
    .select(
      "id, organization_id, invoice_id, rep_facturapi_id, rep_number, rep_folio",
    )
    .eq("rep_cfdi_status", "stamped")
    .is("rep_number", null)
    .not("rep_facturapi_id", "is", null)
    .limit(rowLimit);
  if (manualOrganizationId) {
    folioPendingQuery = folioPendingQuery.eq(
      "organization_id",
      manualOrganizationId,
    );
  }
  return await folioPendingQuery;
}

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

/** REP stamping recovery precedes folio-only recovery, with one shared budget. */
export async function processPaymentComplements(
  { admin, client, organizationId, outOfBudget, results }: ProcessorContext,
  payments: DocumentRow[],
  folioPending: DocumentRow[],
): Promise<boolean> {
  let truncated = false;
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
    // Keep a claim token for every subsequent state write. A stale worker
    // must not overwrite a payment that another worker has since recovered.
    const claimedAt = new Date().toISOString();
    const { data: claimedPayment, error: claimError } = await admin
      .from("payments")
      .update({ rep_stamping_started_at: claimedAt })
      .eq("id", paymentId)
      .eq("organization_id", p.organization_id)
      .eq("rep_cfdi_status", "stamping")
      .eq("rep_stamping_started_at", p.rep_stamping_started_at)
      .select("id")
      .maybeSingle();
    if (claimError || !claimedPayment) {
      results.push({
        invoice_id: paymentId,
        status: claimError ? "rep_persistence_error" : "claimed_by_other_run",
        ...(claimError ? { error: claimError.message } : {}),
      });
      continue;
    }

    const persistRepState = async (
      patch: Record<string, unknown>,
      operation: string,
    ): Promise<boolean> => {
      try {
        const { data, error } = await admin.from("payments")
          .update(patch)
          .eq("id", paymentId)
          .eq("organization_id", p.organization_id)
          .eq("rep_cfdi_status", "stamping")
          .eq("rep_stamping_started_at", claimedAt)
          .select("id")
          .maybeSingle();
        if (!error && data) return true;
        results.push({
          invoice_id: paymentId,
          status: "rep_persistence_error",
          error: error?.message ?? `REP ${operation} update affected no rows`,
        });
      } catch (err) {
        results.push({
          invoice_id: paymentId,
          status: "rep_persistence_error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // Do not release the claim or report a transition unless persisted.
      return false;
    };

    let facturapiId = p.rep_facturapi_id as string | null;
    let repUuid = p.rep_cfdi_uuid as string | null;

    // R12-B2 (payments): sin ids persistidos, lookup al PAC por external_id.
    if (!facturapiId || !repUuid) {
      let pac: PacLookup;
      try {
        pac = await lookupPacInvoice(client, paymentId, facturapiId);
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
        if (
          !(await persistRepState({
            rep_facturapi_id: facturapiId,
            rep_cfdi_uuid: repUuid,
            rep_lookup_attempts: 0,
          }, "identifier"))
        ) continue;
      } else if (outcome.kind === "pending") {
        if (
          !(await persistRepState({
            rep_facturapi_id: outcome.facturapi_id,
            rep_error_message:
              "Facturapi aceptó el REP; timbrado pendiente de resolución.",
          }, "pending state"))
        ) continue;
        results.push({ invoice_id: paymentId, status: "rep_pac_pending" });
        continue;
      } else if (outcome.kind === "manual_review") {
        if (
          !(await persistRepState({
            rep_facturapi_id: outcome.facturapi_id,
            rep_cfdi_status: "error",
            rep_error_message:
              "Facturapi confirmó fallo del REP. Revisar el comprobante antes de volver a emitir.",
          }, "manual review state"))
        ) continue;
        results.push({
          invoice_id: paymentId,
          status: "rep_pac_failed_manual_review",
        });
        continue;
      } else if (outcome.kind === "defer") {
        // N9: solo un miss REAL incrementa el contador; lookup_failed no.
        if (outcome.consume_attempt) {
          if (
            !(await persistRepState({
              rep_lookup_attempts: (lookupAttempts ?? 0) + 1,
            }, "lookup attempt"))
          ) continue;
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
        if (
          !(await persistRepState({
            rep_cfdi_status: "error",
            rep_stamping_started_at: null,
            rep_lookup_attempts: (lookupAttempts ?? 0) + 1,
            rep_error_message:
              `Timbrado de REP interrumpido; Facturapi confirmó ${MAX_LOOKUP_MISSES} veces que el CFDI no existe. Puedes reintentar el timbrado.`,
          }, "retry state"))
        ) continue;
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
        if (
          !(await persistRepState({
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
          }, "XML state"))
        ) continue;
        results.push({
          invoice_id: paymentId,
          status: exhausted
            ? "rep_stamped_xml_pending_manual"
            : "rep_xml_pending",
        });
        continue;
      }
      if (
        !(await persistRepState({
          rep_cfdi_status: "stamped",
          rep_stamping_started_at: null,
          rep_xml_url: xmlPath,
          rep_pdf_url: pdfPath,
          rep_error_message: null,
          rep_lookup_attempts: 0,
          rep_stamping_attempts: 0,
          rep_xml_pending: false,
        }, "finalization"))
      ) continue;
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
  return truncated;
}
