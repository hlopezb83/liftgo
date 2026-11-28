import { loadFacturapiConfigOutcome } from "../_shared/facturapi/client.ts";
import { jsonError } from "../_shared/http.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import type { RelatedInvoiceRow, RepClaimControls } from "./repPreparation.ts";
import { type RepLine, type RepTax, repTaxBreakdown } from "./taxBreakdown.ts";

const DEFAULT_IVA_RATE = 0.16;

export async function loadRelatedPpdInvoiceAndConfig(params: {
  req: Request;
  supabase: SupabaseLike;
  organizationId: string;
  invoiceId: string | null | undefined;
  amount: number;
  env: (k: string) => string | undefined;
  controls: RepClaimControls;
}): Promise<
  | { ok: false; response: Response }
  | {
    ok: true;
    invoiceRow: RelatedInvoiceRow;
    taxes: RepTax[];
    apiKey: string;
  }
> {
  const { req, supabase, organizationId, invoiceId, amount, env, controls } =
    params;
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, organization_id, customer_id, total, tax_rate, line_items, metodo_pago, moneda, tipo_cambio, cfdi_uuid, cfdi_status, receptor_razon_social, receptor_rfc, receptor_regimen_fiscal, receptor_domicilio_fiscal_cp, uso_cfdi, customer_name",
    )
    .eq("id", invoiceId)
    .single();
  if (!invoice) {
    await controls.releaseClaim("Factura no encontrada");
    return { ok: false, response: jsonError(req, 404, "Invoice not found") };
  }
  const invoiceRow = invoice as RelatedInvoiceRow;
  if (invoiceRow.metodo_pago !== "PPD") {
    await controls.releaseClaim("Solo facturas PPD requieren REP");
    return {
      ok: false,
      response: jsonError(
        req,
        400,
        "Solo facturas PPD requieren Complemento de Pago",
      ),
    };
  }
  if (invoiceRow.cfdi_status !== "stamped" || !invoiceRow.cfdi_uuid) {
    await controls.releaseClaim("Factura aún no timbrada");
    return {
      ok: false,
      response: jsonError(
        req,
        400,
        "La factura debe estar timbrada para generar REP",
      ),
    };
  }

  const headerRatePct = invoiceRow.tax_rate == null
    ? DEFAULT_IVA_RATE * 100
    : Number(invoiceRow.tax_rate);
  const rawLines = Array.isArray(invoiceRow.line_items)
    ? (invoiceRow.line_items as RepLine[])
    : [];
  const taxes = repTaxBreakdown(rawLines, headerRatePct, amount);
  if (!taxes) {
    await controls.releaseClaim(
      "No se pudo validar el desglose fiscal del complemento",
    );
    return {
      ok: false,
      response: jsonError(
        req,
        422,
        "Invoice without valid line items for REP tax breakdown",
      ),
    };
  }

  const cfgOutcome = await loadFacturapiConfigOutcome({
    admin: supabase,
    env,
    organizationId,
  });
  if (!cfgOutcome.ok) {
    await controls.releaseClaim(cfgOutcome.message);
    return {
      ok: false,
      response: jsonError(req, cfgOutcome.status, cfgOutcome.message),
    };
  }
  if (!cfgOutcome.apiKey) {
    await controls.releaseClaim(
      "Facturapi key no configurada para esta empresa",
    );
    return {
      ok: false,
      response: jsonError(
        req,
        400,
        "Facturapi key not configured for this organization",
      ),
    };
  }

  return { ok: true, invoiceRow, taxes, apiKey: cfgOutcome.apiKey };
}
