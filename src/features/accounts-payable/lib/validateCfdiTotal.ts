import { roundMoney } from "@/lib/money";
import { CfdiParseError, type CfdiParsed } from "./parseCfdiXml";
import { supplierBillFormTotal } from "./supplierBillFormTotal";

/** Import only amounts that the bill form can represent in the XML's currency. */
export function validateCfdiTotal(parsed: CfdiParsed): void {
  const calculated = supplierBillFormTotal({
    subtotal: parsed.subtotal,
    discount: parsed.discount,
    tax_amount: parsed.taxAmount,
    retention_iva: parsed.retentionIva,
    retention_isr: parsed.retentionIsr,
  });
  if (calculated !== roundMoney(parsed.total)) {
    throw new CfdiParseError(
      `El total del CFDI (${parsed.total.toFixed(2)} ${parsed.currency}) no coincide con los importes que se pueden importar (${calculated.toFixed(2)} ${parsed.currency}). Revisa impuestos, retenciones y complementos; puedes capturar la factura manualmente.`,
    );
  }
}
