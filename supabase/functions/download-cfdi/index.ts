import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";
import {
  binaryToBytes,
  createFacturapiClient,
  describeFacturapiError,
  resolveFacturapiKey,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";

const BUCKET = "cfdi-files";
const FACTURAPI_BASE = "https://www.facturapi.io/v2";

type DlFormat = "xml" | "pdf" | "acuse_xml" | "acuse_pdf";

async function fetchFromFacturapi(
  apiKey: string,
  facturapiId: string,
  format: "xml" | "pdf",
): Promise<
  { ok: true; bytes: Uint8Array } | {
    ok: false;
    status: number;
    detail: string;
  }
> {
  const client = createFacturapiClient(apiKey);
  try {
    const bin = await retryOnFacturapi5xx(() =>
      format === "pdf"
        ? client.invoices.downloadPdf(facturapiId)
        : client.invoices.downloadXml(facturapiId)
    );
    return { ok: true, bytes: await binaryToBytes(bin) };
  } catch (err) {
    const desc = describeFacturapiError(err);
    console.error("[download-cfdi] Facturapi failed after retries", {
      facturapiId,
      format,
      status: desc.status,
      code: desc.code,
    });
    return { ok: false, status: desc.status, detail: desc.detail };
  }
}

async function fetchAcuseFromFacturapi(
  apiKey: string,
  facturapiId: string,
  format: "xml" | "pdf",
): Promise<
  { ok: true; bytes: Uint8Array } | { ok: false; status: number; detail: string }
> {
  const url = `${FACTURAPI_BASE}/invoices/${facturapiId}/cancellation_receipt/${format}`;
  try {
    const res = await retryOnFacturapi5xx(async () => {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        const err = new Error(`Facturapi ${r.status}`) as Error & {
          status?: number;
          detail?: string;
        };
        err.status = r.status;
        err.detail = text;
        throw err;
      }
      return new Uint8Array(await r.arrayBuffer());
    });
    return { ok: true, bytes: res };
  } catch (err) {
    const e = err as { status?: number; detail?: string; message?: string };
    console.error("[download-cfdi] Facturapi acuse failed", {
      facturapiId,
      format,
      status: e.status,
    });
    return {
      ok: false,
      status: e.status ?? 500,
      detail: e.detail ?? e.message ?? "unknown",
    };
  }
}



function resolveKey(
  company: { facturapi_mode?: string | null } | null | undefined,
  secrets:
    | {
      facturapi_test_key?: string | null;
      facturapi_live_key?: string | null;
    }
    | null
    | undefined,
): string | null {
  const mode = (company?.facturapi_mode as string | undefined) || "test";
  return resolveFacturapiKey({
    mode: mode === "live" ? "live" : "test",
    dbTestKey: secrets?.facturapi_test_key ?? null,
    dbLiveKey: secrets?.facturapi_live_key ?? null,
    envTestKey: Deno.env.get("FACTURAPI_TEST_KEY"),
    envLiveKey: Deno.env.get("FACTURAPI_LIVE_KEY"),
  });
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await callerClient.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const userId = claimsData.claims.sub as string;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (roles ?? []).some(
      (r) =>
        r.role === "admin" || r.role === "administrativo" ||
        r.role === "ventas",
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    const body = await req.json().catch(() => null);
    const invoice_id = body?.invoice_id;
    const payment_id = body?.payment_id;
    const credit_note_id = body?.credit_note_id;
    const format = body?.format as DlFormat | undefined;
    const validFormat = format === "xml" || format === "pdf" ||
      format === "acuse_xml" || format === "acuse_pdf";
    if (
      !validFormat ||
      (!isUUID(invoice_id) && !isUUID(payment_id) && !isUUID(credit_note_id))
    ) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const isAcuse = format === "acuse_pdf" || format === "acuse_xml";
    const baseFormat: "pdf" | "xml" = format === "pdf" || format === "acuse_pdf"
      ? "pdf"
      : "xml";
    const contentType = baseFormat === "pdf"
      ? "application/pdf"
      : "application/xml";


    if (isAcuse && !isUUID(invoice_id)) {
      return new Response(
        JSON.stringify({ error: "Acuse download requires invoice_id" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // --- Credit Note download branch ---
    if (isUUID(credit_note_id)) {
      const { data: cn } = await supabase
        .from("credit_notes")
        .select(
          "id, credit_note_number, cfdi_uuid, cfdi_status, cfdi_xml_url, cfdi_pdf_url, facturapi_invoice_id",
        )
        .eq("id", credit_note_id)
        .single();
      if (!cn || cn.cfdi_status !== "stamped" || !cn.cfdi_uuid) {
        return new Response(
          JSON.stringify({ error: "Credit note not stamped" }),
          { status: 409, headers: jsonHeaders },
        );
      }
      const cnFilename = `${cn.credit_note_number || cn.cfdi_uuid}.${baseFormat}`;
      const cnPath = (baseFormat === "pdf" ? cn.cfdi_pdf_url : cn.cfdi_xml_url) as
        | string
        | null;

      if (cnPath) {
        const { data: file } = await supabase.storage.from(BUCKET).download(
          cnPath,
        );
        if (file) {
          return new Response(file, {
            headers: {
              ...corsHeaders,
              "Content-Type": contentType,
              "Content-Disposition": `attachment; filename="${cnFilename}"`,
            },
          });
        }
      }
      if (!cn.facturapi_invoice_id) {
        return new Response(
          JSON.stringify({ error: "Missing facturapi reference" }),
          { status: 404, headers: jsonHeaders },
        );
      }
      const { data: company } = await supabase.from("company_settings").select(
        "facturapi_mode",
      ).limit(1).maybeSingle();
      const { data: secrets } = await supabase.from("billing_secrets").select(
        "facturapi_test_key, facturapi_live_key",
      ).limit(1).maybeSingle();
      const apiKey = resolveKey(company, secrets);
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Facturapi key not configured" }),
          { status: 500, headers: jsonHeaders },
        );
      }
      const res = await fetchFromFacturapi(
        apiKey,
        cn.facturapi_invoice_id as string,
        baseFormat,
      );

      if (!res.ok) {
        return new Response(
          JSON.stringify({
            error: res.status >= 500 ? "Facturapi está experimentando problemas. Intenta de nuevo en unos segundos." : `Facturapi error: ${res.status}`,
            detail: res.detail,
          }),
          { status: 502, headers: jsonHeaders },
        );
      }
      const bytes = res.bytes;

      const newPath = `credit-notes/${cn.id}/${cn.cfdi_uuid}.${baseFormat}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(
        newPath,
        bytes,
        { contentType, upsert: true },
      );
      if (!upErr) {
        await supabase
          .from("credit_notes")
          .update(
            baseFormat === "pdf"
              ? { cfdi_pdf_url: newPath }
              : { cfdi_xml_url: newPath },
          )
          .eq("id", credit_note_id);
      }

      return new Response(bytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${cnFilename}"`,
        },
      });
    }

    // --- REP (Payment Complement) download branch ---
    if (isUUID(payment_id)) {
      const { data: payment } = await supabase
        .from("payments")
        .select(
          "invoice_id, rep_facturapi_id, rep_cfdi_uuid, rep_cfdi_status, rep_xml_url, rep_pdf_url",
        )
        .eq("id", payment_id)
        .single();
      if (
        !payment || payment.rep_cfdi_status !== "stamped" ||
        !payment.rep_cfdi_uuid
      ) {
        return new Response(JSON.stringify({ error: "REP not stamped" }), {
          status: 409,
          headers: jsonHeaders,
        });
      }
      const repFilename = `REP-${payment.rep_cfdi_uuid}.${baseFormat}`;
      const repPath =
        (baseFormat === "pdf" ? payment.rep_pdf_url : payment.rep_xml_url) as
          | string
          | null;

      if (repPath) {
        const { data: file } = await supabase.storage.from(BUCKET).download(
          repPath,
        );
        if (file) {
          return new Response(file, {
            headers: {
              ...corsHeaders,
              "Content-Type": contentType,
              "Content-Disposition": `attachment; filename="${repFilename}"`,
            },
          });
        }
      }
      // Fallback to Facturapi
      if (!payment.rep_facturapi_id) {
        return new Response(
          JSON.stringify({ error: "Missing facturapi REP reference" }),
          { status: 404, headers: jsonHeaders },
        );
      }
      const { data: company } = await supabase.from("company_settings").select(
        "facturapi_mode",
      ).limit(1).maybeSingle();
      const { data: secrets } = await supabase.from("billing_secrets").select(
        "facturapi_test_key, facturapi_live_key",
      ).limit(1).maybeSingle();
      const apiKey = resolveKey(company, secrets);
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Facturapi key not configured" }),
          { status: 500, headers: jsonHeaders },
        );
      }
      const res = await fetchFromFacturapi(
        apiKey,
        payment.rep_facturapi_id as string,
        baseFormat,
      );

      if (!res.ok) {
        return new Response(
          JSON.stringify({
            error: res.status >= 500 ? "Facturapi está experimentando problemas. Intenta de nuevo en unos segundos." : `Facturapi error: ${res.status}`,
            detail: res.detail,
          }),
          { status: 502, headers: jsonHeaders },
        );
      }
      const bytes = res.bytes;

      const newPath =
        `${payment.invoice_id}/rep-${payment.rep_cfdi_uuid}.${baseFormat}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(
        newPath,
        bytes,
        { contentType, upsert: true },
      );
      if (!upErr) {
        await supabase
          .from("payments")
          .update(
            baseFormat === "pdf"
              ? { rep_pdf_url: newPath }
              : { rep_xml_url: newPath },
          )
          .eq("id", payment_id);
      }

      return new Response(bytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${repFilename}"`,
        },
      });
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, cfdi_uuid, cfdi_status, cfdi_xml, cfdi_xml_url, cfdi_pdf_url, facturapi_invoice_id",
      )
      .eq("id", invoice_id)
      .single();
    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }
    if (invoice.cfdi_status !== "stamped" || !invoice.cfdi_uuid) {
      return new Response(JSON.stringify({ error: "Invoice not stamped" }), {
        status: 409,
        headers: jsonHeaders,
      });
    }

    const filename = `${invoice.invoice_number || invoice.cfdi_uuid}.${format}`;
    const storagePath =
      (format === "pdf" ? invoice.cfdi_pdf_url : invoice.cfdi_xml_url) as
        | string
        | null;

    // 1) Try Storage
    if (storagePath) {
      const { data: file } = await supabase.storage.from(BUCKET).download(
        storagePath,
      );
      if (file) {
        return new Response(file, {
          headers: {
            ...corsHeaders,
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }
    }

    // 2) Fallback: XML respaldado en columna
    if (format === "xml" && invoice.cfdi_xml) {
      return new Response(invoice.cfdi_xml, {
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // 3) Fallback: descargar desde Facturapi y archivar
    if (!invoice.facturapi_invoice_id) {
      return new Response(
        JSON.stringify({ error: "Missing facturapi reference" }),
        {
          status: 404,
          headers: jsonHeaders,
        },
      );
    }

    const { data: company } = await supabase
      .from("company_settings").select("facturapi_mode").limit(1).maybeSingle();
    const { data: secrets } = await supabase
      .from("billing_secrets").select("facturapi_test_key, facturapi_live_key")
      .limit(1).maybeSingle();
    const apiKey = resolveKey(company, secrets);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Facturapi key not configured" }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const res = await fetchFromFacturapi(
      apiKey,
      invoice.facturapi_invoice_id as string,
      format,
    );
    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: res.status >= 500 ? "Facturapi está experimentando problemas. Intenta de nuevo en unos segundos." : `Facturapi error: ${res.status}`,
          detail: res.detail.slice(0, 500),
        }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const bytes = res.bytes;

    const newPath = `${invoice_id}/${invoice.cfdi_uuid}.${format}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(newPath, bytes, { contentType, upsert: true });
    if (!upErr) {
      await supabase
        .from("invoices")
        .update(
          format === "pdf"
            ? { cfdi_pdf_url: newPath }
            : { cfdi_xml_url: newPath },
        )
        .eq("id", invoice_id);
    } else {
      console.error("Storage upload failed:", upErr);
    }

    return new Response(bytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("download-cfdi error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
