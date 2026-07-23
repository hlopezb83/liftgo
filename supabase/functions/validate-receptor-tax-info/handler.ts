// Pure handler for validate-receptor-tax-info.
// Consulta el endpoint público de Facturapi `/v2/tools/tax_id_validation`
// para descubrir qué campo del receptor no coincide con la Constancia de
// Situación Fiscal registrada en el SAT. No consume timbre.
import { handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";
import { sanitizeLegalName } from "../_shared/sanitizeLegalName.ts";
import { getFacturapiConfig } from "../_shared/facturapi/client.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import { authenticateWithDeps } from "../_shared/authWithDeps.ts";

export type { SupabaseLike };

const FACTURAPI_BASE = "https://www.facturapi.io/v2";

export interface ValidateReceptorDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  fetchImpl: typeof fetch;
  env: (k: string) => string | undefined;
}

interface ValidationResult {
  is_valid: boolean;
  errors: Array<{ path: string; message: string; code?: string }>;
  sent: {
    tax_id: string;
    legal_name: string;
    tax_system: string;
    zip: string;
  };
}

export async function handleValidateReceptor(
  req: Request,
  deps: ValidateReceptorDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (body: unknown, status: number, _headers?: unknown) =>
    jsonResponse(req, body, { status });

  try {
    const auth = await authenticateWithDeps({
      req,
      createCallerClient: (h) => deps.createCallerClient(h),
      createServiceClient: () => deps.createServiceClient(),
      allowedRoles: ["admin", "administrativo"],
      logTag: "[validate-receptor-tax-info]",
    });
    if (!auth.ok) return json({ error: auth.message }, auth.status, jsonHeaders);
    const supabase = auth.supabase;

    const body = await req.json().catch(() => null);
    const invoice_id = body?.invoice_id;
    if (!isUUID(invoice_id)) {
      return json({ error: "invoice_id must be UUID" }, 400, jsonHeaders);
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices").select("*").eq("id", invoice_id).single();
    if (invErr || !invoice) {
      return json({ error: "Invoice not found" }, 404, jsonHeaders);
    }
    const inv = invoice as Record<string, unknown>;

    const { apiKey } = await getFacturapiConfig(supabase, deps.env);
    if (!apiKey) {
      return json(
        { error: "Facturapi API key not configured" },
        400,
        jsonHeaders,
      );
    }

    const sent = {
      tax_id: String(inv.receptor_rfc || "").toUpperCase(),
      legal_name: sanitizeLegalName(
        String(inv.receptor_razon_social || inv.customer_name || ""),
      ),
      tax_system: String(inv.receptor_regimen_fiscal || ""),
      zip: String(inv.receptor_domicilio_fiscal_cp || ""),
    };

    if (!sent.tax_id || !sent.legal_name || !sent.tax_system || !sent.zip) {
      return json(
        {
          error:
            "Faltan datos fiscales del receptor (RFC, razón social, régimen o CP). Complétalos antes de validar.",
          sent,
        },
        400,
        jsonHeaders,
      );
    }

    if (sent.tax_id === "XAXX010101000") {
      return json(
        {
          is_valid: true,
          errors: [],
          sent,
          note: "Público en General no se valida contra SAT.",
        } as ValidationResult,
        200,
        jsonHeaders,
      );
    }

    const qs = new URLSearchParams({
      tax_id: sent.tax_id,
      legal_name: sent.legal_name,
      tax_system: sent.tax_system,
      zip: sent.zip,
    }).toString();

    const res = await deps.fetchImpl(
      `${FACTURAPI_BASE}/tools/tax_id_validation?${qs}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    const rawText = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      return json(
        {
          error: `Facturapi validation error: ${res.status}`,
          detail: rawText.slice(0, 2000),
          sent,
        },
        502,
        jsonHeaders,
      );
    }

    const data = (parsed ?? {}) as {
      is_valid?: boolean;
      errors?: Array<{ path?: string; message?: string; code?: string }>;
    };

    const result: ValidationResult = {
      is_valid: data.is_valid === true,
      errors: (data.errors ?? []).map((e) => ({
        path: e.path ?? "",
        message: e.message ?? "",
        code: e.code,
      })),
      sent,
    };

    return json(result, 200, jsonHeaders);
  } catch (err) {
    console.error("[validate-receptor-tax-info] unhandled", {
      message: err instanceof Error ? err.message : String(err),
    });
    return json({ error: "Internal server error" }, 500, jsonHeaders);
  }
}
