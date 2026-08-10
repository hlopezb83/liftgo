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
  getFacturapiConfig,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";

import {
  decideRowAction,
  MAX_STAMPING_ATTEMPTS,
  type PacLookup,
  type StuckRow as PureStuckRow,
} from "./decisions.ts";

interface StuckRow extends PureStuckRow {
  serie: string | null;
  folio: string | null;
  updated_at: string;
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (b: unknown, status: number) => jsonResponse(req, b, { status });

  // Lote C · DIFF 8 rest: auth timing-safe centralizada en _shared/cronAuth.ts.
  const admin = getAdminClient();
  const auth = await authenticateCronRequest(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const STALE_THRESHOLD_MIN = 10;
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000)
    .toISOString();

  const { data: rows, error } = await admin
    .from("invoices")
    .select(
      "id, cfdi_uuid, facturapi_invoice_id, serie, folio, updated_at, stamping_attempts",
    )
    .eq("cfdi_status", "stamping")
    .lt("updated_at", cutoff)
    .limit(20);

  if (error) {
    console.error("[reconcile-stamping] fetch failed", error);
    return json({ error: "Fetch failed" }, 500);
  }

  const stuck = (rows ?? []) as StuckRow[];
  if (stuck.length === 0) {
    return json({ processed: 0, results: [] }, 200);
  }

  const { apiKey, mode } = await getFacturapiConfig(
    admin as unknown as { from: (t: string) => unknown } as never,
    (k) => Deno.env.get(k),
  );
  if (!apiKey) {
    return json(
      { error: "Facturapi no configurado; no se puede reconciliar" },
      500,
    );
  }
  const client = createFacturapiClient(apiKey);

  const results: Array<
    { invoice_id: string; status: string; error?: string }
  > = [];

  for (const row of stuck) {
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
        // H6: PAC no respondió o la búsqueda no encontró nada (aún). Bump del
        // contador y dejar la fila en 'stamping' para el próximo ciclo.
        await admin.from("invoices")
          .update({ stamping_attempts: (row.stamping_attempts ?? 0) + 1 })
          .eq("id", row.id);
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
        const path = `${row.id}/${row.cfdi_uuid}.xml`;
        const { error: upErr } = await admin.storage.from("cfdi-files").upload(
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
        const path = `${row.id}/${row.cfdi_uuid}.pdf`;
        const { error: upErr } = await admin.storage.from("cfdi-files").upload(
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
        const exhausted = attempts >= MAX_STAMPING_ATTEMPTS;
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
  const { data: stuckPayments, error: payErr } = await admin
    .from("payments")
    .select(
      "id, invoice_id, rep_cfdi_uuid, rep_facturapi_id, rep_stamping_started_at",
    )
    .eq("rep_cfdi_status", "stamping")
    .lt("rep_stamping_started_at", cutoff)
    .limit(20);

  if (payErr) {
    console.error("[reconcile-stamping] payments fetch failed", payErr);
  }

  for (const p of (stuckPayments ?? []) as Array<Record<string, unknown>>) {
    const paymentId = p.id as string;
    let facturapiId = p.rep_facturapi_id as string | null;
    let repUuid = p.rep_cfdi_uuid as string | null;

    // R12-B2 (payments): sin ids persistidos, lookup al PAC por external_id.
    if (!facturapiId || !repUuid) {
      let lookupFailed = false;
      try {
        const listFn = (client.invoices as unknown as {
          list?: (q: Record<string, unknown>) => Promise<unknown>;
        }).list;
        if (typeof listFn === "function") {
          const res = await retryOnFacturapi5xx(() =>
            listFn.call(client.invoices, { q: paymentId, limit: 5 }) as Promise<unknown>
          );
          const data = ((res as { data?: unknown }).data ?? []) as Array<
            Record<string, unknown>
          >;
          const hit = data.find((d) =>
            String((d as { external_id?: unknown }).external_id ?? "") === paymentId
          );
          if (hit && typeof hit.id === "string" && typeof hit.uuid === "string") {
            facturapiId = hit.id;
            repUuid = hit.uuid;
            await admin.from("payments")
              .update({ rep_facturapi_id: facturapiId, rep_cfdi_uuid: repUuid })
              .eq("id", paymentId);
          }
        }
      } catch (err) {
        lookupFailed = true;
        console.error("[reconcile-stamping] REP lookup failed", {
          payment_id: paymentId,
          err: describeFacturapiError(err).message,
        });
      }
      if (!facturapiId || !repUuid) {
        if (lookupFailed) {
          // PAC no respondió: dejar en 'stamping' y reintentar el próximo ciclo.
          results.push({ invoice_id: paymentId, status: "rep_lookup_deferred" });
          continue;
        }
        // PAC confirma que nunca se timbró → seguro volver a 'error'.
        await admin.from("payments")
          .update({
            rep_cfdi_status: "error",
            rep_stamping_started_at: null,
            rep_error_message:
              "Timbrado de REP interrumpido sin registro en Facturapi. Puedes reintentar el timbrado.",
          })
          .eq("id", paymentId);
        results.push({ invoice_id: paymentId, status: "rep_reverted_to_error" });
        continue;
      }
    }

    // Con ids: descargar XML/PDF y marcar stamped (idempotente).
    try {
      let xmlPath: string | null = null;
      let pdfPath: string | null = null;
      try {
        const xmlTxt = await binaryToText(
          await retryOnFacturapi5xx(() => client.invoices.downloadXml(facturapiId!)),
        );
        const path = `${p.invoice_id}/rep-${repUuid}.xml`;
        const { error: upErr } = await admin.storage.from("cfdi-files").upload(
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
          await retryOnFacturapi5xx(() => client.invoices.downloadPdf(facturapiId!)),
        );
        const path = `${p.invoice_id}/rep-${repUuid}.pdf`;
        const { error: upErr } = await admin.storage.from("cfdi-files").upload(
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
        results.push({ invoice_id: paymentId, status: "rep_xml_pending" });
        continue;
      }
      await admin.from("payments")
        .update({
          rep_cfdi_status: "stamped",
          rep_stamping_started_at: null,
          rep_xml_url: xmlPath,
          rep_pdf_url: pdfPath,
          rep_error_message: null,
        })
        .eq("id", paymentId);
      results.push({ invoice_id: paymentId, status: "rep_reconciled" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[reconcile-stamping] REP unexpected", { payment_id: paymentId, err: msg });
      results.push({ invoice_id: paymentId, status: "rep_exception", error: msg });
    }
  }

  // ── H5: reconciliación de NOTAS DE CRÉDITO ───────────────────────────────
  // El claim de stamp-credit-note solo admite pending|error y nada reconciliaba
  // credit_notes: una NC en 'stamping' tras timeout quedaba ingestionable.
  const { data: stuckNcs, error: ncErr } = await admin
    .from("credit_notes")
    .select("id, cfdi_uuid, facturapi_invoice_id, updated_at")
    .eq("cfdi_status", "stamping")
    .lt("updated_at", cutoff)
    .limit(20);

  if (ncErr) {
    console.error("[reconcile-stamping] credit_notes fetch failed", ncErr);
  }

  for (const nc of (stuckNcs ?? []) as Array<Record<string, unknown>>) {
    const ncId = nc.id as string;
    let facturapiId = nc.facturapi_invoice_id as string | null;
    let ncUuid = nc.cfdi_uuid as string | null;

    if (!facturapiId || !ncUuid) {
      let lookupFailed = false;
      try {
        const listFn = (client.invoices as unknown as {
          list?: (q: Record<string, unknown>) => Promise<unknown>;
        }).list;
        if (typeof listFn === "function") {
          const res = await retryOnFacturapi5xx(() =>
            listFn.call(client.invoices, { q: ncId, limit: 5 }) as Promise<unknown>
          );
          const data = ((res as { data?: unknown }).data ?? []) as Array<
            Record<string, unknown>
          >;
          const hit = data.find((d) =>
            String((d as { external_id?: unknown }).external_id ?? "") === ncId
          );
          if (hit && typeof hit.id === "string" && typeof hit.uuid === "string") {
            facturapiId = hit.id;
            ncUuid = hit.uuid;
            await admin.from("credit_notes")
              .update({ facturapi_invoice_id: facturapiId, cfdi_uuid: ncUuid })
              .eq("id", ncId);
          }
        }
      } catch (err) {
        lookupFailed = true;
        console.error("[reconcile-stamping] NC lookup failed", {
          credit_note_id: ncId,
          err: describeFacturapiError(err).message,
        });
      }
      if (!facturapiId || !ncUuid) {
        if (lookupFailed) {
          results.push({ invoice_id: ncId, status: "nc_lookup_deferred" });
          continue;
        }
        // PAC confirma que nunca se timbró → 'error' (el claim vuelve a admitirla).
        await admin.from("credit_notes")
          .update({
            cfdi_status: "error",
            cfdi_error_message:
              "Timbrado de NC interrumpido sin registro en Facturapi. Puedes reintentar el timbrado.",
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
          await retryOnFacturapi5xx(() => client.invoices.downloadXml(facturapiId!)),
        );
        const path = `credit-notes/${ncId}/${ncUuid}.xml`;
        const { error: upErr } = await admin.storage.from("cfdi-files").upload(
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
          await retryOnFacturapi5xx(() => client.invoices.downloadPdf(facturapiId!)),
        );
        const path = `credit-notes/${ncId}/${ncUuid}.pdf`;
        const { error: upErr } = await admin.storage.from("cfdi-files").upload(
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
        results.push({ invoice_id: ncId, status: "nc_xml_pending" });
        continue;
      }
      await admin.from("credit_notes")
        .update({
          cfdi_status: "stamped",
          status: "stamped",
          cfdi_xml_url: xmlPath,
          cfdi_pdf_url: pdfPath,
          cfdi_error_message: null,
        })
        .eq("id", ncId);
      results.push({ invoice_id: ncId, status: "nc_reconciled" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[reconcile-stamping] NC unexpected", { credit_note_id: ncId, err: msg });
      results.push({ invoice_id: ncId, status: "nc_exception", error: msg });
    }
  }

  return json({ processed: results.length, results }, 200);
});
