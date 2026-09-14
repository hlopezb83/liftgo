// Pure handler for validate-receptor-tax-info.
// Consulta el endpoint público de Facturapi `/v2/tools/tax_id_validation`
// para descubrir qué campo del receptor no coincide con la Constancia de
// Situación Fiscal registrada en el SAT. No consume timbre.
import { handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";
import { sanitizeLegalName } from "../_shared/sanitizeLegalName.ts";
import { getFacturapiConfigForOrganization } from "../_shared/facturapi/client.ts";
import { validateTaxIdWithPac } from "../_shared/facturapi/validateTaxId.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import {
  authenticateWithDeps,
  type CallerLike,
} from "../_shared/authWithDeps.ts";
import { resolveDocumentOrganization } from "../_shared/orgContext.ts";

export type { SupabaseLike };

export interface ValidateReceptorDeps {
  createCallerClient: (authHeader: string) => CallerLike;
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
  const jsonHeaders = undefined;

  try {
    const auth = await authenticateWithDeps({
      req,
      createCallerClient: (h) => deps.createCallerClient(h),
      createServiceClient: () => deps.createServiceClient(),
      allowedRoles: ["admin", "administrativo"],
      logTag: "[validate-receptor-tax-info]",
    });
    if (!auth.ok) {
      return json({ error: auth.message }, auth.status, jsonHeaders);
    }
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

    // Multiempresa · Fase 1: la organización SIEMPRE se deriva del servidor
    // (membresía del caller + organization_id de la factura leída en BD),
    // nunca del body de la petición. Rechazamos ANTES de leer secretos o
    // llamar al PAC.
    const orgRes = await resolveDocumentOrganization({
      admin: supabase,
      userId: auth.userId,
      isServiceRole: auth.isServiceRole,
      documentOrganizationId: inv.organization_id as string | null | undefined,
    });
    if (!orgRes.ok) {
      return json({ error: orgRes.message }, orgRes.status, jsonHeaders);
    }

    const { apiKey } = await getFacturapiConfigForOrganization({
      admin: supabase,
      env: deps.env,
      organizationId: orgRes.organizationId,
    });
    if (!apiKey) {
      return json(
        {
          error:
            `No hay una llave de Facturapi configurada para tu empresa (organization_id: ${orgRes.organizationId}).`,
        },
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

    // La llamada al PAC vive en `_shared/facturapi/validateTaxId.ts` y la
    // comparte la validación masiva de la cartera.
    const outcome = await validateTaxIdWithPac(sent, apiKey, deps.fetchImpl);

    if (outcome.kind === "timeout") {
      return json(
        {
          error: "PAC no respondió a tiempo, reintenta",
          code: "TIMEOUT",
          transient: true,
        },
        504,
        jsonHeaders,
      );
    }

    if (outcome.kind === "http_error") {
      return json(
        {
          error: `Facturapi validation error: ${outcome.status}`,
          detail: outcome.message,
          sent,
        },
        502,
        jsonHeaders,
      );
    }

    const result: ValidationResult = {
      is_valid: outcome.kind === "valid",
      errors: outcome.errors,
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
