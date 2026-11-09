import {
  binaryToBytes,
  binaryToText,
  describeFacturapiError,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";
import { organizationStoragePath } from "../_shared/storagePath.ts";
import { lookupPacInvoice } from "../_shared/facturapi/invoiceRecovery.ts";
import type { ProcessorContext, SelectionContext } from "./processorTypes.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import type { DocumentRow } from "./processorTypes.ts";
import { recoverCreditNotePdf } from "./recoverCreditNotePdf.ts";
import {
  decideLookupOutcome,
  decideXmlFailure,
  MAX_LOOKUP_MISSES,
  MAX_STAMPING_ATTEMPTS,
  type PacLookup,
} from "./decisions.ts";

export async function selectStuckCreditNotes({
  admin,
  cutoff,
  manualOrganizationId,
  rowLimit,
}: SelectionContext) {
  let creditNotesQuery = admin
    .from("credit_notes")
    .select(
      "id, organization_id, cfdi_uuid, facturapi_invoice_id, updated_at, lookup_attempts, stamping_attempts",
    )
    .eq("cfdi_status", "stamping")
    .lt("updated_at", cutoff)
    .limit(rowLimit);
  if (manualOrganizationId) {
    creditNotesQuery = creditNotesQuery.eq(
      "organization_id",
      manualOrganizationId,
    );
  }
  return await creditNotesQuery;
}

export async function selectCreditNotePdfs({
  admin,
  cutoff,
  manualOrganizationId,
  rowLimit,
}: SelectionContext) {
  let pdfPendingQuery = admin.from("credit_notes").select(
    "id, organization_id, status, cfdi_status, cancellation_status, cfdi_uuid, facturapi_invoice_id, cfdi_xml_url, cfdi_xml_pending, cfdi_pdf_url, updated_at",
  ).eq("cfdi_status", "stamped").eq("status", "stamped")
    .eq("cancellation_status", "none").eq("cfdi_xml_pending", false).is(
      "cfdi_pdf_url",
      null,
    )
    .not("cfdi_xml_url", "is", null).not("cfdi_uuid", "is", null)
    .not("facturapi_invoice_id", "is", null).lt("updated_at", cutoff)
    .order("updated_at", { ascending: true }).order("id", { ascending: true })
    .limit(rowLimit);
  if (manualOrganizationId) {
    pdfPendingQuery = pdfPendingQuery.eq(
      "organization_id",
      manualOrganizationId,
    );
  }
  return await pdfPendingQuery;
}

/** Fiscal NC reconciliation and file-only PDF recovery remain separate lanes. */
export async function processCreditNotes(
  { admin, client, organizationId, mode, outOfBudget, results }:
    ProcessorContext,
  ncs: DocumentRow[],
  pdfPending: DocumentRow[],
): Promise<boolean> {
  let truncated = false;
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
    // updated_at is changed by the database trigger on every write. Keep
    // the exact returned value (including microseconds) as our next CAS token.
    let ncClaimTimestamp = nc.updated_at;
    const persistNcState = async (
      patch: Record<string, unknown>,
      operation: string,
      claiming = false,
    ): Promise<boolean> => {
      try {
        if (typeof ncClaimTimestamp !== "string") {
          throw new Error("NC claim timestamp is missing");
        }
        const { data, error } = await admin.from("credit_notes")
          .update(patch)
          .eq("id", ncId)
          .eq("organization_id", organizationId)
          .eq("cfdi_status", "stamping")
          .eq("updated_at", ncClaimTimestamp)
          .select("id, updated_at")
          .maybeSingle();
        if (!error && data && typeof data.updated_at === "string") {
          ncClaimTimestamp = data.updated_at;
          return true;
        }
        results.push({
          invoice_id: ncId,
          status: claiming && !error && !data
            ? "claimed_by_other_run"
            : "nc_persistence_error",
          ...(claiming && !error && !data ? {} : {
            error: error?.message ??
              `NC ${operation} update was not confirmed`,
          }),
        });
      } catch (err) {
        results.push({
          invoice_id: ncId,
          status: "nc_persistence_error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // Never announce a transition or continue recovery on an uncertain write.
      return false;
    };
    if (
      !(await persistNcState(
        { updated_at: new Date().toISOString() },
        "claim",
        true,
      ))
    ) continue;
    let facturapiId = nc.facturapi_invoice_id as string | null;
    let ncUuid = nc.cfdi_uuid as string | null;

    if (!facturapiId || !ncUuid) {
      let pac: PacLookup;
      try {
        pac = await lookupPacInvoice(client, ncId, facturapiId);
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
        if (
          !(await persistNcState({
            facturapi_invoice_id: facturapiId,
            cfdi_uuid: ncUuid,
            lookup_attempts: 0, // racha de misses consecutivos: reset
          }, "recover identifiers"))
        ) continue;
      } else if (outcome.kind === "pending") {
        if (
          !(await persistNcState({
            facturapi_invoice_id: outcome.facturapi_id,
            cfdi_error_message:
              "Facturapi aceptó la NC; timbrado pendiente de resolución.",
          }, "PAC pending"))
        ) continue;
        results.push({ invoice_id: ncId, status: "nc_pac_pending" });
        continue;
      } else if (outcome.kind === "manual_review") {
        if (
          !(await persistNcState({
            facturapi_invoice_id: outcome.facturapi_id,
            cfdi_status: "error",
            cfdi_error_message:
              "Facturapi confirmó fallo de la NC. Revisar el comprobante antes de volver a emitir.",
          }, "manual review"))
        ) continue;
        results.push({
          invoice_id: ncId,
          status: "nc_pac_failed_manual_review",
        });
        continue;
      } else if (outcome.kind === "defer") {
        // N9: solo un miss REAL incrementa el contador; lookup_failed no.
        if (outcome.consume_attempt) {
          if (
            !(await persistNcState({
              lookup_attempts: (lookupAttempts ?? 0) + 1,
            }, "lookup miss"))
          ) continue;
        }
        results.push({ invoice_id: ncId, status: "nc_lookup_deferred" });
        continue;
      } else {
        // N5: revert SOLO tras MAX_LOOKUP_MISSES misses consecutivos con el
        // PAC respondiendo (el claim vuelve a admitir pending|error).
        if (
          !(await persistNcState({
            cfdi_status: "error",
            lookup_attempts: (lookupAttempts ?? 0) + 1,
            cfdi_error_message:
              `Timbrado de NC interrumpido; Facturapi confirmó ${MAX_LOOKUP_MISSES} veces que el CFDI no existe. Puedes reintentar el timbrado.`,
          }, "lookup exhausted"))
        ) continue;
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
        if (
          !(await persistNcState({
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
          }, "XML recovery"))
        ) continue;
        results.push({
          invoice_id: ncId,
          status: exhausted
            ? "nc_stamped_xml_pending_manual"
            : "nc_xml_pending",
        });
        continue;
      }
      if (
        !(await persistNcState({
          cfdi_status: "stamped",
          status: "stamped",
          cfdi_xml_url: xmlPath,
          cfdi_pdf_url: pdfPath,
          cfdi_error_message: null,
          lookup_attempts: 0,
          stamping_attempts: 0,
          cfdi_xml_pending: false,
        }, "finalize"))
      ) continue;
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
  for (const nc of pdfPending) {
    if (outOfBudget()) {
      truncated = true;
      break;
    }
    results.push(
      await recoverCreditNotePdf(
        admin as unknown as SupabaseLike,
        client,
        nc,
        organizationId,
        mode,
        outOfBudget,
      ),
    );
  }
  return truncated;
}
