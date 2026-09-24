import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { getMissingStampFields } from "./cfdiPrechecks";

/**
 * Backfill snapshot fiscal del receptor + defaults SAT en facturas antiguas
 * (creadas antes de v6.16.3) que no tienen los campos hidratados.
 * Sólo rellena valores nulos/vacíos; nunca sobrescribe datos existentes.
 */
const isEmpty = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

interface CustomerSnap {
  rfc: string | null;
  razon_social: string | null;
  alias: string | null;
  regimen_fiscal: string | null;
  domicilio_fiscal_cp: string | null;
  uso_cfdi: string | null;
}

function mergeCustomerFields(invoice: Tables<"invoices">, customer: CustomerSnap, patch: Partial<Tables<"invoices">>) {
  if (isEmpty(invoice.receptor_rfc) && customer.rfc) patch.receptor_rfc = customer.rfc;
  const razon = customer.razon_social ?? customer.alias;
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

  // Un cliente puede tener fichas fiscales distintas en cada empresa. La RLS
  // de esta relación resuelve la empresa de la sesión; nunca usamos la
  // identidad global como respaldo para timbrar.
  const { data: customer, error: customerError } = await supabase
    .from("organization_customers")
    .select("rfc, razon_social, alias, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi")
    .eq("customer_id", invoice.customer_id)
    .maybeSingle();
  if (customerError) throw customerError;

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

  // El timbrado posterior lee la factura de la base. No podemos tratar un
  // parche fallido como guardado: eso permitiría continuar con datos viejos.
  if (error) throw error;
  if (!updated) throw new Error("No se pudo guardar el respaldo fiscal de la factura");
  return updated;
}

