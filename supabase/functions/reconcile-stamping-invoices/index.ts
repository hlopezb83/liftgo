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
  decideLookupOutcome,
  decideRowAction,
  decideXmlFailure,
  MAX_LOOKUP_MISSES,
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

  // N4: consultar TAMBIÉN REP y NC atascados ANTES de decidir si salir —
  // si solo hay pagos o NCs en 'stamping', el cron no debe irse sin
  // procesarlos (deadlock permanente tras un timeout del PAC).
  const { data: stuckPayments, error: payErr } = await admin
    .from("payments")
    .select(
      "id, invoice_id, rep_cfdi_uuid, rep_facturapi_id, rep_stamping_started_at, rep_lookup_attempts, rep_stamping_attempts",
    )
    .eq("rep_cfdi_status", "stamping")
    .lt("rep_stamping_started_at", cutoff)
    .limit(20);

  if (payErr) {
    console.error("[reconcile-stamping] payments fetch failed", payErr);
  }

  const { data: stuckNcs, error: ncErr } = await admin
    .from("credit_notes")
    .select(
      "id, cfdi_uuid, facturapi_invoice_id, updated_at, lookup_attempts, stamping_attempts",
    )
    .eq("cfdi_status", "stamping")
    .lt("updated_at", cutoff)
    .limit(20);

  if (ncErr) {
    console.error("[reconcile-stamping] credit_notes fetch failed", ncErr);
  }

  const stuck = (rows ?? []) as StuckRow[];
  const payments = (stuckPayments ?? []) as Array<Record<string, unknown>>;
  const ncs = (stuckNcs ?? []) as Array<Record<string, unknown>>;

  // N4: salir SOLO si las tres listas están vacías. Con trabajo pendiente,
  // se continúa y se pide la config del PAC (no se gasta en ciclos vacíos).
  if (stuck.length === 0 && payments.length === 0 && ncs.length === 0) {
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
    { invoice_id: string; status: string; error?: string }
  > = [];

  for (const row of stuck) {
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
    const paymentId = p.id as string;
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
            listFn.call(client.invoices, { q: paymentId, limit: 5 }) as Promise<
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
        results.push({ invoice_id: paymentId, status: "rep_lookup_deferred" });
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
          await retryOnFacturapi5xx(() =>
            client.invoices.downloadPdf(facturapiId!)
          ),
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
        // B-15: presupuesto de reintentos como en invoices (H6) — antes un REP
        // cuyo XML nunca se podía descargar reintentaba POR SIEMPRE. Tras
        // MAX_STAMPING_ATTEMPTS se marca stamped + rep_xml_pending (el CFDI ya
        // existe ante el SAT; el XML se sube manualmente desde el portal del
        // PAC) para que salga de la cola.
        const attempts = ((p.rep_stamping_attempts as number | null) ?? 0) + 1;
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
      results.push({ invoice_id: paymentId, status: "rep_reconciled" });
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

  // ── H5: reconciliación de NOTAS DE CRÉDITO ───────────────────────────────
  // El claim de stamp-credit-note solo admite pending|error y nada reconciliaba
  // credit_notes: una NC en 'stamping' tras timeout quedaba ingestionable.
  // N4: la consulta se movió ARRIBA del early return (bloque inicial).
  for (const nc of ncs) {
    const ncId = nc.id as string;
    if (!(await claimRow("credit_notes", ncId, "updated_at", nc.updated_at))) {
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
            String((d as { external_id?: unknown }).external_id ?? "") === ncId
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
          await retryOnFacturapi5xx(() =>
            client.invoices.downloadPdf(facturapiId!)
          ),
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

  return json({ processed: results.length, results }, 200);
});
