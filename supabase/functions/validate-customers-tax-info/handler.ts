// Validación masiva de la cartera de clientes contra la Constancia de
// Situación Fiscal del SAT (vía el endpoint de validación del PAC).
// No consume timbre. Sólo Admin / Administrativo.
//
// Procesa por lotes con pausa entre llamadas para no saturar al PAC y guarda
// el resultado en `customers.sat_validation_*`. Cada corrida atiende primero
// a los clientes nunca validados o validados hace más tiempo, de modo que
// llamadas sucesivas recorren toda la cartera.
import { handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";
import { sanitizeLegalName } from "../_shared/sanitizeLegalName.ts";
import { getFacturapiConfig } from "../_shared/facturapi/client.ts";
import {
  RFC_PUBLICO_GENERAL,
  type TaxIdValidationError,
  validateTaxIdWithPac,
} from "../_shared/facturapi/validateTaxId.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import {
  authenticateWithDeps,
  type CallerLike,
} from "../_shared/authWithDeps.ts";

export type { SupabaseLike };

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 150;
const DELAY_MS = 150;

export interface ValidateCustomersDeps {
  createCallerClient: (authHeader: string) => CallerLike;
  createServiceClient: () => SupabaseLike;
  fetchImpl: typeof fetch;
  env: (k: string) => string | undefined;
  sleep?: (ms: number) => Promise<void>;
}

interface CustomerRow {
  id: string;
  name: string;
  rfc: string | null;
  razon_social: string | null;
  regimen_fiscal: string | null;
  domicilio_fiscal_cp: string | null;
}

export interface ValidateCustomersSummary {
  processed: number;
  valid: number;
  mismatch: number;
  error: number;
  remaining: number;
  results: Array<{
    customer_id: string;
    name: string;
    status: "valid" | "mismatch" | "error";
    errors: TaxIdValidationError[];
  }>;
}

function missingFieldErrors(c: CustomerRow): TaxIdValidationError[] {
  const out: TaxIdValidationError[] = [];
  if (!c.rfc?.trim()) out.push({ path: "rfc", message: "Falta el RFC" });
  if (!(c.razon_social?.trim() || c.name?.trim())) {
    out.push({ path: "razon_social", message: "Falta la razón social" });
  }
  if (!c.regimen_fiscal?.trim()) {
    out.push({ path: "regimen_fiscal", message: "Falta el régimen fiscal" });
  }
  if (!c.domicilio_fiscal_cp?.trim()) {
    out.push({ path: "domicilio_fiscal_cp", message: "Falta el C.P. fiscal" });
  }
  return out;
}

export async function handleValidateCustomers(
  req: Request,
  deps: ValidateCustomersDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (body: unknown, status: number) =>
    jsonResponse(req, body, { status });
  const sleep = deps.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  try {
    const auth = await authenticateWithDeps({
      req,
      createCallerClient: (h) => deps.createCallerClient(h),
      createServiceClient: () => deps.createServiceClient(),
      allowedRoles: ["admin", "administrativo"],
      logTag: "[validate-customers-tax-info]",
    });
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    const supabase = auth.supabase;

    const body = await req.json().catch(() => null);
    const rawLimit = Number(body?.limit ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const onlyPending = body?.only_pending === true;

    const { apiKey } = await getFacturapiConfig(supabase, deps.env);
    if (!apiKey) {
      return json({ error: "Facturapi API key not configured" }, 400);
    }

    let query = supabase
      .from("customers")
      .select("id,name,rfc,razon_social,regimen_fiscal,domicilio_fiscal_cp")
      .is("deleted_at", null)
      .not("rfc", "is", null)
      .neq("rfc", "")
      .neq("rfc", RFC_PUBLICO_GENERAL);
    if (onlyPending) query = query.eq("sat_validation_status", "not_validated");

    const { data, error } = await query
      .order("sat_validated_at", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (error) {
      console.error("[validate-customers-tax-info] query", error);
      return json({ error: "No se pudo leer la cartera de clientes" }, 500);
    }

    const customers = (data ?? []) as CustomerRow[];
    const summary: ValidateCustomersSummary = {
      processed: 0,
      valid: 0,
      mismatch: 0,
      error: 0,
      remaining: 0,
      results: [],
    };

    for (const c of customers) {
      let status: "valid" | "mismatch" | "error" = "error";
      let errors: TaxIdValidationError[] = missingFieldErrors(c);

      if (errors.length === 0) {
        const outcome = await validateTaxIdWithPac(
          {
            tax_id: String(c.rfc).trim().toUpperCase(),
            legal_name: sanitizeLegalName(
              String(c.razon_social || c.name || ""),
            ),
            tax_system: String(c.regimen_fiscal).trim(),
            zip: String(c.domicilio_fiscal_cp).trim(),
          },
          apiKey,
          deps.fetchImpl,
        );

        if (outcome.kind === "valid") {
          status = "valid";
          errors = [];
        } else if (outcome.kind === "mismatch") {
          status = "mismatch";
          errors = outcome.errors;
        } else if (outcome.kind === "timeout") {
          status = "error";
          errors = [{ path: "", message: outcome.message, code: "TIMEOUT" }];
        } else {
          status = "error";
          errors = [{
            path: "",
            message: `El PAC respondió ${outcome.status}`,
            code: "PAC_ERROR",
          }];
        }
        await sleep(DELAY_MS);
      }

      await supabase
        .from("customers")
        .update({
          sat_validation_status: status,
          sat_validated_at: new Date().toISOString(),
          sat_validation_errors: errors,
        })
        .eq("id", c.id);

      summary.processed += 1;
      summary[status] += 1;
      summary.results.push({
        customer_id: c.id,
        name: c.razon_social || c.name,
        status,
        errors,
      });
    }

    const { count } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("rfc", "is", null)
      .neq("rfc", "")
      .neq("rfc", RFC_PUBLICO_GENERAL)
      .eq("sat_validation_status", "not_validated");
    summary.remaining = count ?? 0;

    return json(summary, 200);
  } catch (err) {
    console.error("[validate-customers-tax-info] unhandled", {
      message: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(req, { error: "Internal server error" }, {
      status: 500,
    });
  }
}
