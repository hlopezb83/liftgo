import {
  binaryToBytes,
  binaryToText,
  describeFacturapiError,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";
import { organizationStoragePath } from "../_shared/storagePath.ts";
import { lookupPacInvoice } from "../_shared/facturapi/invoiceRecovery.ts";
import type { ProcessorContext, SelectionContext } from "./processorTypes.ts";
import type { StuckInvoice } from "./processorTypes.ts";
import {
  decideRowAction,
  decideXmlFailure,
  MAX_STAMPING_ATTEMPTS,
  type PacLookup,
} from "./decisions.ts";

export async function selectStuckInvoices({
  admin,
  cutoff,
  manualOrganizationId,
  rowLimit,
}: SelectionContext) {
  let invoicesQuery = admin
    .from("invoices")
    .select(
      "id, organization_id, cfdi_uuid, facturapi_invoice_id, serie, folio, updated_at, stamping_attempts",
    )
    .eq("cfdi_status", "stamping")
    .lt("updated_at", cutoff)
    .limit(rowLimit);
  if (manualOrganizationId) {
    invoicesQuery = invoicesQuery.eq("organization_id", manualOrganizationId);
  }
  return await invoicesQuery;
}

/** Materializes invoice decisions; recovered PAC IDs intentionally wait one cycle. */
export async function processInvoices(
  { admin, client, mode, outOfBudget, results }: ProcessorContext,
  stuck: StuckInvoice[],
): Promise<boolean> {
  let truncated = false;
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
      let pac: PacLookup;
      try {
        pac = await lookupPacInvoice(
          client,
          row.id,
          row.facturapi_invoice_id,
        );
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
      if (action.kind === "pending") {
        await admin.from("invoices").update({
          facturapi_invoice_id: action.facturapi_id,
          cfdi_error_message:
            "Facturapi aceptó el CFDI; timbrado pendiente de resolución.",
        }).eq("id", row.id);
        results.push({ invoice_id: row.id, status: "pac_pending" });
        continue;
      }
      if (action.kind === "manual_review") {
        await admin.from("invoices").update({
          facturapi_invoice_id: action.facturapi_id,
          cfdi_status: "error",
          cfdi_error_message:
            "Facturapi confirmó fallo del timbrado. Revisar el comprobante antes de volver a emitir.",
        }).eq("id", row.id);
        results.push({
          invoice_id: row.id,
          status: "pac_failed_manual_review",
        });
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
  return truncated;
}
