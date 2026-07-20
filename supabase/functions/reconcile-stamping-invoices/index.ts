// EC-A2 — Cron: recupera facturas atascadas en cfdi_status='stamping'.
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
}

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
      "id, cfdi_uuid, facturapi_invoice_id, serie, folio, updated_at",
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
      // Sin datos de Facturapi → no podemos reconciliar. Revertir a error.
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
      // queda fiscalmente incompleta (obligatorio para SAT). Dejamos en
      // 'stamping' + bump de updated_at para reintentar en el próximo ciclo.
      if (!cfdiXml || !xmlPath) {
        await admin.from("invoices")
          .update({
            cfdi_error_message: `Reconcile: descarga de XML falló (${
              xmlError ?? "sin detalle"
            }). Se reintentará automáticamente.`,
          })
          .eq("id", row.id);
        results.push({
          invoice_id: row.id,
          status: "xml_pending",
          error: xmlError ?? undefined,
        });
        continue;
      }

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
