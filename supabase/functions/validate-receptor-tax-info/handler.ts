// Pure handler for validate-receptor-tax-info.
// Consulta el endpoint público de Facturapi `/v2/tools/tax_id_validation`
// para descubrir qué campo del receptor no coincide con la Constancia de
// Situación Fiscal registrada en el SAT. No consume timbre.
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";
import { sanitizeLegalName } from "../_shared/sanitizeLegalName.ts";
import { resolveFacturapiKey } from "../_shared/facturapi/client.ts";
import type { SupabaseLike } from "../_shared/types.ts";

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
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, jsonHeaders);
    }
    const token = authHeader.replace("Bearer ", "");
    const caller = deps.createCallerClient(authHeader);
    const { data: claimsData, error: claimsErr } = await caller.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401, jsonHeaders);
    }
    const userId = claimsData.claims.sub;

    const supabase = deps.createServiceClient();
    const rolesRes = await supabase.from("user_roles").select("role").eq(
      "user_id",
      userId,
    );
    const roles = (rolesRes as { data: unknown }).data as
      | Array<{ role: string }>
      | null;
    const allowed = (roles ?? []).some((r) =>
      r.role === "admin" || r.role === "administrativo"
    );
    if (!allowed) return json({ error: "Forbidden" }, 403, jsonHeaders);

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

function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
