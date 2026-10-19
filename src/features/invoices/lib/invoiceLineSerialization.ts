import type { LineItem } from "@/lib/domain/invoiceHelpers";
import type { LineItemValues } from "./invoiceFormSchema";

export function toLineItems(items: LineItemValues[]): LineItem[] {
  return items.map((i) => ({
    description: i.description ?? "",
    source_quote_id: i.source_quote_id,
    source_quote_line_id: i.source_quote_line_id,
    line_kind: i.line_kind,
    charge_kind: i.charge_kind,
    quantity: Number(i.quantity ?? 0),
    unit_price: Number(i.unit_price ?? 0),
    total: Number(i.total ?? 0),
    discount: i.discount,
    discount_type: i.discount_type,
    clave_prod_serv: i.clave_prod_serv,
    clave_unidad: i.clave_unidad,
    objeto_imp: i.objeto_imp,
    tax_rate: i.tax_rate,
  }));
}
