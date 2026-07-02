// Backfill retroactivo de serie/folio de Facturapi para facturas ya timbradas
// cuyas columnas `serie` y `folio` quedaron en NULL antes de v6.106.3.
// Solo accesible por administradores. Idempotente.
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";
import {
  createFacturapiClient,
  describeFacturapiError,
  resolveFacturapiKey,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  facturapi_invoice_id: string;
  facturapi_env: string | null;
  serie: string | null;
  folio: string | null;
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const supabase = auth.adminClient;

    const { data: company } = await supabase
      .from("company_settings").select("facturapi_mode").limit(1).maybeSingle();
    const { data: secrets } = await supabase
      .from("billing_secrets")
      .select("facturapi_test_key, facturapi_live_key")
      .limit(1).maybeSingle();

    const dbTestKey = (secrets?.facturapi_test_key as string | null) ?? null;
    const dbLiveKey = (secrets?.facturapi_live_key as string | null) ?? null;
    const defaultMode = (company?.facturapi_mode as string) === "live"
      ? "live"
      : "test";

    const testKey = resolveFacturapiKey({
      mode: "test",
      dbTestKey,
      dbLiveKey,
      envTestKey: Deno.env.get("FACTURAPI_TEST_KEY"),
      envLiveKey: Deno.env.get("FACTURAPI_LIVE_KEY"),
    });
    const liveKey = resolveFacturapiKey({
      mode: "live",
      dbTestKey,
      dbLiveKey,
      envTestKey: Deno.env.get("FACTURAPI_TEST_KEY"),
      envLiveKey: Deno.env.get("FACTURAPI_LIVE_KEY"),
    });

    const { data: rows, error } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, facturapi_invoice_id, facturapi_env, serie, folio",
      )
      .not("facturapi_invoice_id", "is", null)
      .or("serie.is.null,folio.is.null");

    if (error) {
      return new Response(
        JSON.stringify({
          error: "Failed to query invoices",
          detail: error.message,
        }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const invoices = (rows ?? []) as InvoiceRow[];
    const results: Array<Record<string, unknown>> = [];
    let updated = 0;
    let failed = 0;

    for (const inv of invoices) {
      const mode = inv.facturapi_env === "live"
        ? "live"
        : (inv.facturapi_env === "test" ? "test" : defaultMode);
      const apiKey = mode === "live" ? liveKey : testKey;
      if (!apiKey) {
        failed++;
        results.push({
          invoice_number: inv.invoice_number,
          ok: false,
          reason: `no ${mode} api key`,
        });
        continue;
      }
      try {
        const client = createFacturapiClient(apiKey);
        const remote = await retryOnFacturapi5xx(() =>
          client.invoices.retrieve(inv.facturapi_invoice_id)
        ) as { series?: string | null; folio_number?: number | string | null };
        const series = remote.series ?? null;
        const folioRaw = remote.folio_number ?? null;
        const folio = folioRaw !== null && folioRaw !== undefined
          ? String(folioRaw)
          : null;

        const patch: Record<string, string> = {};
        if (series && !inv.serie) patch.serie = series;
        if (folio && !inv.folio) patch.folio = folio;

        if (Object.keys(patch).length === 0) {
          results.push({
            invoice_number: inv.invoice_number,
            ok: true,
            skipped: true,
          });
          continue;
        }

        const { error: upErr } = await supabase
          .from("invoices").update(patch).eq("id", inv.id);
        if (upErr) {
          failed++;
          results.push({
            invoice_number: inv.invoice_number,
            ok: false,
            reason: upErr.message,
          });
        } else {
          updated++;
          results.push({
            invoice_number: inv.invoice_number,
            ok: true,
            ...patch,
          });
        }
      } catch (err) {
        failed++;
        const desc = describeFacturapiError(err);
        results.push({
          invoice_number: inv.invoice_number,
          ok: false,
          reason: desc.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: invoices.length,
        updated,
        failed,
        results,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    console.error("[backfill-facturapi-serie-folio] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
