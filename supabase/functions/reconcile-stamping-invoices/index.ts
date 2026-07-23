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

interface StuckRow {
  id: string;
  cfdi_uuid: string | null;
  facturapi_invoice_id: string | null;
  serie: string | null;
  folio: string | null;
  updated_at: string;
  stamping_attempts: number | null;
}

// Máximo de ciclos que reconcile intentará antes de revertir a 'error' con nota
// manual — evita loops eternos si Facturapi nunca produce el XML.
const MAX_STAMPING_ATTEMPTS = 10;

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (b: unknown, status: number) => jsonResponse(req, b, { status });

  // NC-2: gating de auth. Fuente del secreto: Deno.env → fallback a vault vía
  // RPC `internal_get_cron_secret()` para mantener paridad con pg_cron.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = getAdminClient();
  let cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (!cronSecret) {
    const { data: vaultSecret } = await admin.rpc("internal_get_cron_secret");
    cronSecret = typeof vaultSecret === "string" ? vaultSecret : "";
  }
  const headerSecret = req.headers.get("x-cron-secret") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const authorized = (cronSecret.length > 0 &&
    (headerSecret === cronSecret || bearer === cronSecret)) ||
    (serviceKey.length > 0 && bearer === serviceKey);
  if (!authorized) {
    return json({ error: "Unauthorized" }, 401);
  }

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
      // R12 B2: antes de revertir a `error`, consultar Facturapi por external_id
      // (nuestro invoice.id, seteado en stamp-cfdi). El timbre pudo emitirse
      // tras nuestro timeout — si existe, adoptarlo evita re-timbrar y por
      // ende un CFDI duplicado en el SAT.
      let recovered: {
        id?: string;
        uuid?: string;
      } | null = null;
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
            recovered = { id: hit.id, uuid: hit.uuid };
          }
        }
      } catch (err) {
        console.error("[reconcile-stamping] lookup by external_id failed", {
          invoice_id: row.id,
          err: describeFacturapiError(err).message,
        });
      }

      if (recovered?.id && recovered?.uuid) {
        // Persistir los ids recuperados y dejar que el siguiente ciclo
        // baje el XML/PDF y ejecute reconcile_stamping_invoice.
        await admin.from("invoices")
          .update({
            facturapi_invoice_id: recovered.id,
            cfdi_uuid: recovered.uuid,
          })
          .eq("id", row.id);
        results.push({
          invoice_id: row.id,
          status: "recovered_from_pac",
        });
        continue;
      }

      // Sin datos de Facturapi y el PAC no tiene el timbre → revertir.
      await admin.from("invoices")
        .update({
          cfdi_status: "error",
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
                cfdi_status: "error",
                cfdi_error_message:
                  `Reconcile: descarga de XML falló tras ${attempts} intentos (${
                    xmlError ?? "sin detalle"
                  }). Revisar en el portal de Facturapi antes de retimbrar.`,
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
          status: exhausted ? "reverted_to_error_exhausted" : "xml_pending",
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

  return json({ processed: results.length, results }, 200);
});
