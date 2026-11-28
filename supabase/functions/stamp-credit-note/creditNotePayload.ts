import {
  getFacturapiConfigForOrganization,
  isFacturapiConfigError,
} from "../_shared/facturapi/client.ts";
import { checkStampFx } from "../_shared/fxGate.ts";
import { roundMoney } from "../_shared/money.ts";
import {
  isValidRegimenFiscalCode,
  resolveReceptorRegimenFiscal,
} from "../_shared/regimenFiscal.ts";
import { validateRfcOrMessage } from "../_shared/rfcChecksum.ts";
import { sanitizeLegalName } from "../_shared/sanitizeLegalName.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import type {
  JsonResponder,
  ValidSourceLines,
} from "./creditNoteClaimAndSource.ts";

export async function resolveCreditNoteFiscalConfig(params: {
  supabase: SupabaseLike;
  env: (k: string) => string | undefined;
  organizationId: string;
  creditNoteId: string;
  releaseClaim: (errorMessage?: string) => Promise<void>;
  json: JsonResponder;
}): Promise<
  { ok: false; response: Response } | { ok: true; apiKey: string }
> {
  const { supabase, env, organizationId, creditNoteId, releaseClaim, json } =
    params;
  const { data: company, error: companyErr } = await supabase
    .from("company_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (companyErr) {
    await releaseClaim(
      "No se pudo leer la configuración fiscal de la empresa. No se emitió CFDI de la NC.",
    );
    return {
      ok: false,
      response: json({
        error:
          "No se pudo leer la configuración fiscal de la empresa. Reintenta en unos segundos.",
      }, 503),
    };
  }

  const modeOverride = (company as Record<string, unknown> | null)
    ?.facturapi_mode as string | undefined | null;
  let apiKey: string | null;
  let mode: string;
  try {
    const cfg = await getFacturapiConfigForOrganization({
      admin: supabase,
      env,
      organizationId,
      modeOverride: modeOverride ?? null,
    });
    apiKey = cfg.apiKey;
    mode = cfg.mode;
  } catch (err) {
    if (isFacturapiConfigError(err)) {
      console.error("[stamp-credit-note] configuración fiscal no resoluble", {
        organization_id: organizationId,
        code: err.code,
      });
      await releaseClaim(
        "Configuración fiscal de la empresa no resoluble. No se emitió CFDI de la NC.",
      );
      return {
        ok: false,
        response: json(
          { error: err.message },
          err.code === "config_read_error" ? 503 : 400,
        ),
      };
    }
    throw err;
  }

  if (!apiKey) {
    if (mode === "live") {
      await releaseClaim(
        "Facturapi API key no configurada para modo live. No se emitió CFDI de la NC.",
      );
      return {
        ok: false,
        response: json({
          error:
            "Facturapi API key no configurada para modo live. Configura la key antes de timbrar la nota de crédito.",
        }, 400),
      };
    }
    const mockUuid = crypto.randomUUID();
    await supabase
      .from("credit_notes")
      .update({
        cfdi_uuid: mockUuid,
        cfdi_status: "stamped",
        status: "stamped",
      })
      .eq("id", creditNoteId);
    return {
      ok: false,
      response: json({ success: true, cfdi_uuid: mockUuid, stub: true }, 200),
    };
  }

  return { ok: true, apiKey };
}

function mapCreditNoteItems(
  sourceLines: ValidSourceLines,
): Array<Record<string, unknown>> {
  return sourceLines.map((li) => {
    const item: Record<string, unknown> = {
      product: {
        description: li.description,
        product_key: li.productKey,
        unit_key: li.unitKey,
        price: li.unitPrice,
        tax_included: false,
        taxes: li.objetoImp === "01"
          ? []
          : [{ type: "IVA", rate: li.taxRatePct / 100 }],
      },
      quantity: li.quantity,
    };
    if (li.discountAmount > 0) {
      item.discount = roundMoney(li.discountAmount);
    }
    return item;
  });
}

async function validateNamedCreditNoteReceptor(
  taxSystem: string,
  zip: string,
  releaseClaim: (errorMessage?: string) => Promise<void>,
  json: JsonResponder,
): Promise<Response | null> {
  const missingFiscal: string[] = [];
  if (!taxSystem) missingFiscal.push("régimen fiscal del receptor");
  if (!zip) missingFiscal.push("código postal fiscal del receptor");
  if (missingFiscal.length > 0) {
    const msg = `Faltan datos fiscales del receptor: ${
      missingFiscal.join(", ")
    }. Captúralos en el cliente o en la factura antes de timbrar.`;
    await releaseClaim(msg);
    return json({ error: msg }, 400);
  }
  if (!isValidRegimenFiscalCode(taxSystem)) {
    const msg =
      `El régimen fiscal del receptor "${taxSystem}" no es un código válido del catálogo del SAT (c_RegimenFiscal). Debe ser el código de 3 dígitos, p. ej. "601". Corrígelo en la factura origen (o en el cliente y vuelve a generar el borrador) antes de timbrar.`;
    await releaseClaim(msg);
    return json({ error: msg }, 422);
  }
  return null;
}

export async function buildCreditNotePayload(params: {
  creditNoteId: string;
  ncRow: Record<string, unknown>;
  inv: Record<string, unknown>;
  sourceLines: ValidSourceLines;
  releaseClaim: (errorMessage?: string) => Promise<void>;
  json: JsonResponder;
}): Promise<
  | { ok: false; response: Response }
  | { ok: true; payload: Record<string, unknown> }
> {
  const { creditNoteId, ncRow, inv, sourceLines, releaseClaim, json } = params;
  const items = mapCreditNoteItems(sourceLines);

  const legalName = sanitizeLegalName(
    String(
      inv.receptor_razon_social || inv.customer_name || "Público General",
    ),
  );
  const taxId = String(inv.receptor_rfc || "XAXX010101000").toUpperCase();
  const isGlobalReceptor = taxId === "XAXX010101000";
  const taxSystem = resolveReceptorRegimenFiscal(
    isGlobalReceptor,
    inv.receptor_regimen_fiscal as string | null | undefined,
  );
  const zip = isGlobalReceptor
    ? String(inv.receptor_domicilio_fiscal_cp || "06600")
    : String(inv.receptor_domicilio_fiscal_cp ?? "").trim();

  const ncRfcError = validateRfcOrMessage(taxId);
  if (ncRfcError) {
    await releaseClaim(ncRfcError);
    return { ok: false, response: json({ error: ncRfcError }, 400) };
  }

  if (!isGlobalReceptor) {
    const receptorErr = await validateNamedCreditNoteReceptor(
      taxSystem,
      zip,
      releaseClaim,
      json,
    );
    if (receptorErr) return { ok: false, response: receptorErr };
  }

  const invPaymentMethod = String(inv.metodo_pago || "PUE");
  const fxCurrency = (ncRow.currency ?? inv.moneda ?? "MXN") as
    | string
    | null
    | undefined;
  const fxGate = checkStampFx(
    fxCurrency,
    inv.tipo_cambio as number | string | null | undefined,
  );
  if (!fxGate.ok) {
    await releaseClaim(fxGate.message);
    return { ok: false, response: json({ error: fxGate.message }, 422) };
  }

  return {
    ok: true,
    payload: {
      type: "E",
      use: "G02",
      external_id: creditNoteId,
      idempotency_key: creditNoteId,
      customer: {
        legal_name: legalName,
        tax_id: taxId,
        tax_system: taxSystem,
        address: { zip },
      },
      items,
      payment_form: inv.forma_pago || "99",
      payment_method: invPaymentMethod,
      currency: fxGate.currency,
      exchange: fxGate.exchange,
      related_documents: [
        {
          relationship: "01",
          documents: [String(inv.cfdi_uuid)],
        },
      ],
    },
  };
}
