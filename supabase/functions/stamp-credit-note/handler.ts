// Pure handler for stamp-credit-note, deps-injected for testability.
import { handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";
import { sanitizeLegalName } from "../_shared/sanitizeLegalName.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import {
  binaryToBytes,
  binaryToText,
  createFacturapiClient,
  describeFacturapiError,
  getFacturapiConfig,
} from "../_shared/facturapi/client.ts";

export type { SupabaseLike };
export interface StampCreditNoteDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  fetchImpl: typeof fetch;
  env: (k: string) => string | undefined;
}

export const FACTURAPI_BASE = "https://www.facturapi.io/v2";
const BUCKET = "cfdi-files";

type LineItem = {
  description?: string;
  quantity?: number;
  unit_price?: number;
  product_key?: string;
};

export async function handleStampCreditNote(
  req: Request,
  deps: StampCreditNoteDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (body: unknown, status: number, _headers?: unknown) =>
    jsonResponse(req, body, { status });
  const jsonHeaders = undefined;

  let credit_note_id: unknown = undefined;
  let userId: string | undefined = undefined;
  // Referencias externas al try para que el outer-catch pueda liberar el claim
  // atómico ante excepciones inesperadas y evitar que la NC quede en "stamping".
  let supabaseRef: SupabaseLike | null = null;
  let claimed = false;
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[stamp-credit-note] missing bearer token");
      return json({ error: "Unauthorized" }, 401, jsonHeaders);
    }
    const token = authHeader.replace("Bearer ", "");

    const callerClient = deps.createCallerClient(authHeader);
    const { data: claimsData, error: claimsErr } = await callerClient.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error("[stamp-credit-note] getClaims failed", {
        err: claimsErr instanceof Error ? claimsErr.message : String(claimsErr),
      });
      return json({ error: "Unauthorized" }, 401, jsonHeaders);
    }
    userId = claimsData.claims.sub;

    const supabase = deps.createServiceClient();
    supabaseRef = supabase;
    const rolesRes = await supabase.from("user_roles").select("role").eq(
      "user_id",
      userId,
    );
    const roles = (rolesRes as { data: unknown; error: unknown }).data as
      | Array<{ role: string }>
      | null;
    const rolesErr = (rolesRes as { data: unknown; error: unknown }).error;
    if (rolesErr) {
      console.error("[stamp-credit-note] roles lookup failed", { userId });
      return json({ error: "Authorization check failed" }, 500, jsonHeaders);
    }
    const allowed = (roles ?? []).some((r) =>
      r.role === "admin" || r.role === "administrativo"
    );
    if (!allowed) {
      console.error("[stamp-credit-note] forbidden", { userId });
      return json({ error: "Forbidden" }, 403, jsonHeaders);
    }

    const body = await req.json().catch(() => null);
    credit_note_id = body?.credit_note_id;
    if (!isUUID(credit_note_id)) {
      console.error("[stamp-credit-note] invalid credit_note_id", { userId });
      return json({ error: "credit_note_id must be UUID" }, 400, jsonHeaders);
    }

    const { data: nc, error: ncErr } = await supabase
      .from("credit_notes").select("*").eq("id", credit_note_id).single();
    if (ncErr || !nc) {
      console.error("[stamp-credit-note] credit note not found", {
        credit_note_id,
        userId,
        err: ncErr instanceof Error ? ncErr.message : String(ncErr),
      });
      return json({ error: "Credit note not found" }, 404, jsonHeaders);
    }
    const ncRow = nc as Record<string, unknown>;
    if (ncRow.cfdi_status === "stamped") {
      console.error("[stamp-credit-note] already stamped", {
        credit_note_id,
        uuid: ncRow.cfdi_uuid,
      });
      return json({ error: "Credit note already stamped" }, 409, jsonHeaders);
    }
    // Claim atómico para evitar doble timbrado concurrente.
    const claimRes = await supabase
      .from("credit_notes")
      .update({ cfdi_status: "stamping" })
      .eq("id", credit_note_id)
      .in("cfdi_status", ["pending", "error"])
      .is("cfdi_uuid", null)
      .select("id")
      .maybeSingle();
    if (!(claimRes as { data: unknown }).data) {
      console.error(
        "[stamp-credit-note] claim failed — concurrent stamp or unexpected status",
        { credit_note_id, current_status: ncRow.cfdi_status },
      );
      return json(
        { error: "Credit note already stamped or in progress" },
        409,
        jsonHeaders,
      );
    }
    claimed = true;


    // BL-03: helper para revertir claim atómico si algo falla antes de timbrar.
    const releaseClaim = async (errorMessage?: string) => {
      await supabase.from("credit_notes")
        .update({
          cfdi_status: errorMessage ? "error" : "pending",
          ...(errorMessage
            ? { cfdi_error_message: errorMessage.slice(0, 1000) }
            : {}),
        })
        .eq("id", credit_note_id);
    };

    const { data: invoice, error: invErr } = await supabase
      .from("invoices").select("*").eq("id", ncRow.invoice_id).single();
    if (invErr || !invoice) {
      console.error("[stamp-credit-note] source invoice not found", {
        credit_note_id,
        invoice_id: ncRow.invoice_id,
      });
      await releaseClaim("Source invoice not found");
      return json({ error: "Invoice not found" }, 404, jsonHeaders);
    }
    const inv = invoice as Record<string, unknown>;
    if (
      inv.cfdi_status !== "stamped" || !inv.facturapi_invoice_id ||
      !inv.cfdi_uuid
    ) {
      console.error("[stamp-credit-note] source invoice not stamped", {
        credit_note_id,
        invoice_id: ncRow.invoice_id,
        inv_cfdi_status: inv.cfdi_status,
      });
      await releaseClaim("Source invoice must be stamped");
      return json(
        { error: "Source invoice must be stamped" },
        400,
        jsonHeaders,
      );
    }

    // BL-08: validación server-side anti-sobre-acreditación. Sumamos TODAS las NCs
    // de esta factura que no estén canceladas (stamped + pending + stamping + error).
    // Como el claim atómico ya movió esta NC a "stamping", queda incluida en la suma.
    const { data: siblingNcs } = await supabase
      .from("credit_notes")
      .select("id, total, cfdi_status, cancellation_status, status")
      .eq("invoice_id", ncRow.invoice_id);
    const activeNcTotal = ((siblingNcs ?? []) as Array<Record<string, unknown>>)
      .filter((n) =>
        n.cancellation_status !== "accepted" &&
        n.status !== "cancelled"
      )
      .reduce((s, n) => s + Number(n.total ?? 0), 0);
    const invoiceTotal = Number(inv.total ?? 0);
    if (activeNcTotal - 0.01 > invoiceTotal) {
      await releaseClaim(
        `Notas de crédito acumuladas (${
          activeNcTotal.toFixed(2)
        }) exceden el total facturado (${invoiceTotal.toFixed(2)}).`,
      );
      return json(
        {
          error:
            `El monto total de notas de crédito excede el importe de la factura. Suma NCs: ${
              activeNcTotal.toFixed(2)
            } > factura ${invoiceTotal.toFixed(2)}.`,
        },
        400,
        jsonHeaders,
      );
    }

    // BL-16: modo Facturapi debe ser el de la compañía (test/live) para que la NC
    // se timbre en el mismo ambiente que la factura origen.
    const { data: company } = await supabase
      .from("company_settings").select("*").limit(1).maybeSingle();
    const modeOverride = (company as Record<string, unknown> | null)
      ?.facturapi_mode as
        | string
        | undefined
        | null;
    const { apiKey, mode } = await getFacturapiConfig(supabase, deps.env, {
      modeOverride: modeOverride ?? null,
    });

    if (!apiKey) {
      // BL-20: no marcar como timbrada una NC en modo live sin API key.
      if (mode === "live") {
        await releaseClaim(
          "Facturapi API key no configurada para modo live. No se emitió CFDI de la NC.",
        );
        return json(
          {
            error:
              "Facturapi API key no configurada para modo live. Configura la key antes de timbrar la nota de crédito.",
          },
          400,
          jsonHeaders,
        );
      }
      const mockUuid = crypto.randomUUID();
      await supabase.from("credit_notes")
        .update({
          cfdi_uuid: mockUuid,
          cfdi_status: "stamped",
          status: "stamped",
        })
        .eq("id", credit_note_id);
      return json(
        { success: true, cfdi_uuid: mockUuid, stub: true },
        200,
        jsonHeaders,
      );
    }

    const client = createFacturapiClient(apiKey);

    // BL-01: distinguir tasa 0 legítima. En NC guardamos tax_rate como porcentaje;
    // si viene null usamos 16% (default corporativo). Antes: > 0 ? /100 : 0 → NCs
    // sobre facturas exentas timbraban al 0% pero la factura al 16% (inconsistente).
    const ncTaxRatePct = ncRow.tax_rate == null ? 16 : Number(ncRow.tax_rate);
    const ncTaxRateFraction = ncTaxRatePct / 100;
    const items = Array.isArray(ncRow.line_items)
      ? (ncRow.line_items as LineItem[]).map((li) => ({
        product: {
          description: li.description || "Nota de crédito",
          product_key: li.product_key || "84111506",
          price: li.unit_price || 0,
          tax_included: false,
          taxes: [{
            type: "IVA",
            rate: ncTaxRateFraction,
          }],
        },
        quantity: li.quantity || 1,
      }))
      : [];

    const legalName = sanitizeLegalName(
      String(
        inv.receptor_razon_social || inv.customer_name || "Público General",
      ),
    );

    const taxId = String(inv.receptor_rfc || "XAXX010101000").toUpperCase();
    const taxSystem = String(inv.receptor_regimen_fiscal || "616");
    const zip = String(inv.receptor_domicilio_fiscal_cp || "06600");

    // BL-16: propagar payment_method y exchange reales de la factura origen.
    // Antes se hardcodeaba PUE + exchange 1: NC sobre PPD emitía documento no
    // relacionable ante el SAT; NC sobre USD ignoraba tipo de cambio.
    const invPaymentMethod = String(inv.metodo_pago || "PUE");
    const invCurrency = String(ncRow.currency || inv.moneda || "MXN");
    const invExchange = invCurrency === "MXN"
      ? 1
      : Number(inv.tipo_cambio || 1) || 1;

    const payload: Record<string, unknown> = {
      type: "E",
      use: "G02",
      customer: {
        legal_name: legalName,
        tax_id: taxId,
        tax_system: taxSystem,
        address: { zip },
      },
      items,
      payment_form: inv.forma_pago || "99",
      payment_method: invPaymentMethod,
      currency: invCurrency,
      exchange: invExchange,
      related_documents: [
        {
          relationship: "01",
          documents: [String(inv.cfdi_uuid)],
        },
      ],
    };

    let fa: {
      id: string;
      uuid: string;
      folio_number?: number | string | null;
    };
    try {
      fa = await client.invoices.create(payload) as {
        id: string;
        uuid: string;
        folio_number?: number | string | null;
      };
    } catch (err) {
      const desc = describeFacturapiError(err);
      console.error("[stamp-credit-note] facturapi rejected", {
        credit_note_id,
        status: desc.status,
        code: desc.code,
        message: desc.message,
      });
      await supabase.from("credit_notes")
        .update({
          cfdi_status: "error",
          cfdi_error_message: desc.detail.slice(0, 1000),
        })
        .eq("id", credit_note_id);
      return json(
        { error: `Facturapi error: ${desc.status}`, detail: desc.detail },
        502,
        jsonHeaders,
      );
    }

    const facturApiId = fa.id;
    const cfdiUuid = fa.uuid;

    let xmlPath: string | null = null;
    let pdfPath: string | null = null;

    try {
      const xml = await binaryToText(
        await client.invoices.downloadXml(facturApiId),
      );
      const path = `credit-notes/${credit_note_id}/${cfdiUuid}.xml`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(
        path,
        new Blob([xml], { type: "application/xml" }),
        { contentType: "application/xml", upsert: true },
      );
      if (!upErr) xmlPath = path;
      else {
        console.error("[stamp-credit-note] archive xml upload failed", {
          credit_note_id,
          err: upErr,
        });
      }
    } catch (e) {
      console.error("[stamp-credit-note] archive xml failed", {
        credit_note_id,
        err: e instanceof Error ? e.message : String(e),
      });
    }

    try {
      const bytes = await binaryToBytes(
        await client.invoices.downloadPdf(facturApiId),
      );
      const path = `credit-notes/${credit_note_id}/${cfdiUuid}.pdf`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(
        path,
        bytes,
        { contentType: "application/pdf", upsert: true },
      );
      if (!upErr) pdfPath = path;
      else {
        console.error("[stamp-credit-note] archive pdf upload failed", {
          credit_note_id,
          err: upErr,
        });
      }
    } catch (e) {
      console.error("[stamp-credit-note] archive pdf failed", {
        credit_note_id,
        err: e instanceof Error ? e.message : String(e),
      });
    }

    const updRes = await supabase.from("credit_notes").update({
      facturapi_invoice_id: facturApiId,
      cfdi_uuid: cfdiUuid,
      cfdi_status: "stamped",
      status: "stamped",
      cfdi_xml_url: xmlPath,
      cfdi_pdf_url: pdfPath,
      cfdi_error_message: null,
    }).eq("id", credit_note_id);

    const updErr = (updRes as { error: unknown }).error;
    if (updErr) {
      console.error("[stamp-credit-note] DB update failed after stamp", {
        credit_note_id,
        cfdiUuid,
      });
      return json(
        { error: "Stamped but failed to save to DB" },
        500,
        jsonHeaders,
      );
    }

    // Folio diferido: si el credit_note_number sigue siendo placeholder
    // BORRADOR-NC-XXXX y Facturapi devolvió folio, promovemos a NC-<folio>.
    // Facturapi es la fuente de verdad para mantener 1:1 con su serie.
    let finalCreditNoteNumber: string | null = null;
    const currentNcNum = (ncRow.credit_note_number as string | null) ?? null;
    const facturApiFolioRaw = fa.folio_number ?? null;
    const facturApiFolio: string | null = facturApiFolioRaw !== null &&
        facturApiFolioRaw !== undefined
      ? String(facturApiFolioRaw)
      : null;

    if (
      facturApiFolio &&
      currentNcNum &&
      currentNcNum.startsWith("BORRADOR-NC-")
    ) {
      const rpcRes = await (supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("assign_stamped_credit_note_number", {
        p_credit_note_id: credit_note_id,
        p_folio: facturApiFolio,
      });
      const rpcErr = rpcRes.error as { message?: string } | null;
      if (rpcErr) {
        console.error(
          "[stamp-credit-note] assign_stamped_credit_note_number failed",
          { credit_note_id, err: rpcErr.message },
        );
      } else {
        finalCreditNoteNumber = rpcRes.data as string;
      }
    }

    return json(
      {
        success: true,
        cfdi_uuid: cfdiUuid,
        facturapi_invoice_id: facturApiId,
        credit_note_number: finalCreditNoteNumber ?? currentNcNum,
      },
      200,
      jsonHeaders,
    );
  } catch (err) {
    console.error("[stamp-credit-note] unhandled exception", {
      credit_note_id,
      userId,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // BL-03 (cierre): liberar el claim atómico ante excepción no manejada.
    // Sin esto la NC queda en 'stamping' para siempre.
    if (claimed && supabaseRef && credit_note_id) {
      try {
        await supabaseRef.from("credit_notes")
          .update({
            cfdi_status: "error",
            cfdi_error_message: "Internal error during stamping",
          })
          .eq("id", credit_note_id);
      } catch (releaseErr) {
        console.error("[stamp-credit-note] release-on-exception failed", {
          credit_note_id,
          err: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
        });
      }
    }
    return json({ error: "Internal server error" }, 500);
  }
}
