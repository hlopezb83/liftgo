import { supabase } from "@/integrations/supabase/client";
import { getMissingStampFields } from "./cfdiPrechecks";
import type { Tables } from "@/integrations/supabase/types";

/**
 * Backfill snapshot fiscal del receptor + defaults SAT en facturas antiguas
 * (creadas antes de v6.16.3) que no tienen los campos hidratados.
 * Sólo rellena valores nulos/vacíos; nunca sobrescribe datos existentes.
 */
const isEmpty = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

interface CustomerSnap {
  rfc: string | null;
  razon_social: string | null;
  name: string | null;
  regimen_fiscal: string | null;
  domicilio_fiscal_cp: string | null;
  uso_cfdi: string | null;
}

function mergeCustomerFields(invoice: Tables<"invoices">, customer: CustomerSnap, patch: Partial<Tables<"invoices">>) {
  if (isEmpty(invoice.receptor_rfc) && customer.rfc) patch.receptor_rfc = customer.rfc;
  const razon = customer.razon_social ?? customer.name;
  if (isEmpty(invoice.receptor_razon_social) && razon) patch.receptor_razon_social = razon;
  if (isEmpty(invoice.receptor_regimen_fiscal) && customer.regimen_fiscal) {
    patch.receptor_regimen_fiscal = customer.regimen_fiscal;
  }
  if (isEmpty(invoice.receptor_domicilio_fiscal_cp) && customer.domicilio_fiscal_cp) {
    patch.receptor_domicilio_fiscal_cp = customer.domicilio_fiscal_cp;
  }
  if (isEmpty(invoice.uso_cfdi) && customer.uso_cfdi) patch.uso_cfdi = customer.uso_cfdi;
}

function mergeSatDefaults(invoice: Tables<"invoices">, patch: Partial<Tables<"invoices">>) {
  if (isEmpty(invoice.forma_pago)) patch.forma_pago = "99";
  if (isEmpty(invoice.metodo_pago)) patch.metodo_pago = "PPD";
  if (isEmpty(invoice.moneda)) patch.moneda = "MXN";
  if (invoice.tipo_cambio === null || invoice.tipo_cambio === undefined) patch.tipo_cambio = 1;
}

export async function backfillStampSnapshot(invoice: Tables<"invoices">): Promise<Tables<"invoices">> {
  const missing = getMissingStampFields(invoice);
  if (missing.length === 0) return invoice;
  if (!invoice.customer_id) return invoice;

  const { data: customer } = await supabase
    .from("customers")
    .select("rfc, razon_social, name, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi")
    .eq("id", invoice.customer_id)
    .maybeSingle();

  const patch: Partial<Tables<"invoices">> = {};
  if (customer) mergeCustomerFields(invoice, customer as CustomerSnap, patch);
  mergeSatDefaults(invoice, patch);

  if (Object.keys(patch).length === 0) return invoice;

  const { data: updated, error } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", invoice.id)
    .select()
    .single();

  if (error || !updated) return { ...invoice, ...patch } as Tables<"invoices">;
  return updated;
}
