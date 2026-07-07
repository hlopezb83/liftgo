// Pure handler for stamp-credit-note, deps-injected for testability.
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";
import type { StampCfdiDeps } from "../stamp-cfdi/handler.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import {
  binaryToBytes,
  binaryToText,
  createFacturapiClient,
  describeFacturapiError,
  resolveFacturapiKey,
} from "../_shared/facturapi/client.ts";

export type { SupabaseLike };
export type StampCreditNoteDeps = StampCfdiDeps;

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
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  let credit_note_id: unknown = undefined;
  let userId: string | undefined = undefined;
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

    const { data: invoice, error: invErr } = await supabase
      .from("invoices").select("*").eq("id", ncRow.invoice_id).single();
    if (invErr || !invoice) {
      console.error("[stamp-credit-note] source invoice not found", {
        credit_note_id,
        invoice_id: ncRow.invoice_id,
      });
      return json({ error: "Invoice not found" }, 404, jsonHeaders);
    }
    const inv = invoice as Record<string, unknown>;
    if (inv.cfdi_status !== "stamped" || !inv.facturapi_invoice_id) {
      console.error("[stamp-credit-note] source invoice not stamped", {
        credit_note_id,
        invoice_id: ncRow.invoice_id,
        inv_cfdi_status: inv.cfdi_status,
        has_facturapi_id: !!inv.facturapi_invoice_id,
      });
      return json(
        { error: "Source invoice must be stamped" },
        400,
        jsonHeaders,
      );
    }

    const { data: company } = await supabase
      .from("company_settings").select("facturapi_mode").limit(1).maybeSingle();
    const { data: secrets } = await supabase
      .from("billing_secrets").select("facturapi_test_key, facturapi_live_key")
      .limit(1).maybeSingle();
    const co = (company ?? {}) as Record<string, unknown>;
    const sec = (secrets ?? {}) as Record<string, unknown>;
    const mode = (co.facturapi_mode as string | undefined) || "test";
    const apiKey = resolveFacturapiKey({
      mode: mode === "live" ? "live" : "test",
      dbTestKey: sec.facturapi_test_key as string | null | undefined,
      dbLiveKey: sec.facturapi_live_key as string | null | undefined,
      envTestKey: deps.env("FACTURAPI_TEST_KEY"),
      envLiveKey: deps.env("FACTURAPI_LIVE_KEY"),
    });

    if (!apiKey) {
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

    const items = Array.isArray(ncRow.line_items)
      ? (ncRow.line_items as LineItem[]).map((li) => ({
        product: {
          description: li.description || "Nota de crédito",
          product_key: li.product_key || "84111506",
          price: li.unit_price || 0,
          tax_included: false,
          taxes: [{
            type: "IVA",
            rate: Number(ncRow.tax_rate) > 0 ? Number(ncRow.tax_rate) / 100 : 0,
          }],
        },
        quantity: li.quantity || 1,
      }))
      : [];

    const payload: Record<string, unknown> = {
      type: "E",
      use: "G02",
      customer: {
        legal_name: inv.receptor_razon_social || inv.customer_name ||
          "Público General",
        tax_id: inv.receptor_rfc || "XAXX010101000",
        tax_system: inv.receptor_regimen_fiscal || "616",
        address: { zip: inv.receptor_domicilio_fiscal_cp || "06600" },
      },
      items,
      payment_form: inv.forma_pago || "99",
      payment_method: "PUE",
      currency: ncRow.currency || "MXN",
      exchange: 1,
      related_documents: [
        {
          relationship: "01",
          documents: [String(inv.facturapi_invoice_id)],
        },
      ],
    };

    let fa: { id: string; uuid: string };
    try {
      fa = await client.invoices.create(payload) as {
        id: string;
        uuid: string;
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

    return json(
      { success: true, cfdi_uuid: cfdiUuid, facturapi_invoice_id: facturApiId },
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
    return json({ error: "Internal server error" }, 500, {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    });
  }
}

function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
