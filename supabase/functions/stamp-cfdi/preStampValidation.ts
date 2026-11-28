import { hasLegacyVat, LEGACY_VAT_MESSAGE } from "../_shared/legacyVat.ts";
import { resolveDocumentOrganization } from "../_shared/orgContext.ts";
import { stampOutcome } from "../_shared/stampOutcome.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import { isUUID } from "../_shared/validate.ts";
import {
  resolveSaleSatContext,
  type SaleSatContext,
  validateSaleSatCodes,
} from "./saleSatCodes.ts";

export type JsonResponder = (body: unknown, status: number) => Response;

export interface ClaimControls {
  releaseClaim: (errorMessage?: string) => Promise<void>;
  saveClaim: (patch: Record<string, unknown>) => Promise<boolean>;
  unconfirmedRecovery: () => Response;
}

export interface ClaimedInvoiceContext {
  invoiceId: string;
  inv: Record<string, unknown>;
  organizationId: string;
  saleSatContext: SaleSatContext;
  controls: ClaimControls;
}

function createClaimControls(
  supabase: SupabaseLike,
  invoiceId: string,
  organizationId: string,
  json: JsonResponder,
): ClaimControls {
  return {
    releaseClaim: async (errorMessage?: string) => {
      await supabase
        .from("invoices")
        .update({
          cfdi_status: errorMessage ? "error" : "pending",
          ...(errorMessage
            ? { cfdi_error_message: errorMessage.slice(0, 1000) }
            : {}),
        })
        .eq("id", invoiceId);
    },
    saveClaim: async (patch: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from("invoices")
        .update(patch)
        .eq("id", invoiceId)
        .eq("organization_id", organizationId)
        .eq("cfdi_status", "stamping")
        .is("cfdi_uuid", null)
        .is("facturapi_invoice_id", null)
        .select("id")
        .maybeSingle();
      return !error && Boolean(data);
    },
    unconfirmedRecovery: () =>
      json({
        error:
          "No se confirmó el registro del timbrado. Espera la conciliación antes de reemitir.",
        code: "STAMP_RECOVERY_REQUIRED",
        ...stampOutcome({
          kind: "recovery_required",
          reference: "unconfirmed",
        }),
      }, 503),
  };
}

function checkInvoiceEligibility(
  invoiceId: string,
  inv: Record<string, unknown>,
  json: JsonResponder,
): Response | null {
  if (inv.is_e2e === true) {
    console.error("[stamp-cfdi] e2e invoice rejected", {
      invoice_id: invoiceId,
    });
    return json({ error: "E2E invoices cannot be stamped" }, 403);
  }
  if (inv.status === "cancelled" || inv.cfdi_status === "cancelled") {
    return json({
      error: "La factura está cancelada.",
      ...stampOutcome({ kind: "rejected" }),
    }, 409);
  }
  if (inv.cfdi_status === "stamped" && typeof inv.cfdi_uuid === "string") {
    console.error("[stamp-cfdi] already stamped", {
      invoice_id: invoiceId,
      uuid: inv.cfdi_uuid,
    });
    return json({
      error: "Invoice already stamped",
      cfdi_uuid: inv.cfdi_uuid,
      ...stampOutcome({ kind: "already_issued", cfdi_uuid: inv.cfdi_uuid }),
    }, 409);
  }
  if (inv.facturapi_invoice_id || inv.cfdi_uuid) {
    const recovery = inv.cfdi_status === "stamping" &&
      Boolean(inv.facturapi_invoice_id);
    return json({
      error:
        "El CFDI ya tiene un ID de Facturapi. Espera la conciliación o revisa su estado antes de reemitir.",
      facturapi_invoice_id: inv.facturapi_invoice_id,
      ...(recovery ? { code: "STAMP_RECOVERY_REQUIRED" } : {}),
      ...stampOutcome(
        recovery
          ? { kind: "recovery_required", reference: "saved" }
          : { kind: "rejected" },
      ),
    }, 409);
  }
  if (hasLegacyVat(inv)) {
    return json(
      { error: LEGACY_VAT_MESSAGE, code: "OBSOLETE_VAT_RATE" },
      422,
    );
  }
  return null;
}

async function claimInvoiceRow(
  supabase: SupabaseLike,
  invoiceId: string,
  organizationId: string,
  json: JsonResponder,
): Promise<Response | null> {
  const claimRes = await supabase
    .from("invoices")
    .update({ cfdi_status: "stamping" })
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .in("cfdi_status", ["pending", "error"])
    .is("cfdi_uuid", null)
    .is("facturapi_invoice_id", null)
    .neq("status", "cancelled")
    .select("id")
    .maybeSingle();
  if (claimRes.error) {
    console.error("[stamp-cfdi] claim write failed", { invoice_id: invoiceId });
    if ((claimRes.error as { code?: string }).code === "23514") {
      return json({
        error: "La factura ya no cumple las condiciones para timbrarse.",
        ...stampOutcome({ kind: "rejected" }),
      }, 409);
    }
    return json({ error: "No se pudo tomar el timbrado. Reintenta." }, 503);
  }
  if (!claimRes.data) {
    console.error("[stamp-cfdi] claim failed — concurrent stamp in progress", {
      invoice_id: invoiceId,
    });
    return json({
      error: "Invoice already stamped or in progress",
      ...stampOutcome({ kind: "in_progress" }),
    }, 409);
  }
  return null;
}

export async function validateAndClaimInvoice(params: {
  supabase: SupabaseLike;
  userId: string;
  isServiceRole: boolean;
  invoiceIdRaw: unknown;
  json: JsonResponder;
}): Promise<
  { ok: false; response: Response } | { ok: true; data: ClaimedInvoiceContext }
> {
  const { supabase, userId, isServiceRole, invoiceIdRaw, json } = params;
  if (!isUUID(invoiceIdRaw)) {
    console.error("[stamp-cfdi] invalid invoice_id");
    return {
      ok: false,
      response: json({ error: "invoice_id must be a valid UUID" }, 400),
    };
  }
  const invoiceId = invoiceIdRaw;

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (invErr || !invoice) {
    console.error("[stamp-cfdi] invoice not found", { invoice_id: invoiceId });
    return { ok: false, response: json({ error: "Invoice not found" }, 404) };
  }
  const inv = invoice as Record<string, unknown>;

  const orgCheck = await resolveDocumentOrganization({
    admin: supabase,
    userId,
    isServiceRole,
    documentOrganizationId: inv.organization_id as string | null | undefined,
  });
  if (!orgCheck.ok) {
    console.error("[stamp-cfdi] organization check failed", {
      invoice_id: invoiceId,
      status: orgCheck.status,
    });
    return {
      ok: false,
      response: json({ error: orgCheck.message }, orgCheck.status),
    };
  }
  const organizationId = orgCheck.organizationId;

  const eligibilityErr = checkInvoiceEligibility(invoiceId, inv, json);
  if (eligibilityErr) return { ok: false, response: eligibilityErr };

  const saleSat = await resolveSaleSatContext(supabase, inv, organizationId);
  if (!saleSat.ok) {
    return {
      ok: false,
      response: json(
        { error: saleSat.error, code: saleSat.code },
        saleSat.status,
      ),
    };
  }
  const saleSatCheck = validateSaleSatCodes(inv, saleSat.context);
  if (!saleSatCheck.ok) {
    return {
      ok: false,
      response: json(
        { error: saleSatCheck.error, code: saleSatCheck.code },
        saleSatCheck.status,
      ),
    };
  }

  const claimErr = await claimInvoiceRow(
    supabase,
    invoiceId,
    organizationId,
    json,
  );
  if (claimErr) return { ok: false, response: claimErr };

  return {
    ok: true,
    data: {
      invoiceId,
      inv,
      organizationId,
      saleSatContext: saleSat.context,
      controls: createClaimControls(supabase, invoiceId, organizationId, json),
    },
  };
}
