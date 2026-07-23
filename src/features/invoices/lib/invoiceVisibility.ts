/**
 * Re-export shim — la matriz de visibilidad canónica vive en
 * `@/lib/rules/invoiceVisibility` para que `lib/rules/invoices` no
 * necesite importar de `features/*` (ciclo lib → features).
 */
export {
  computeInvoiceVisibility,
  type InvoiceVisibility,
} from "@/lib/rules/invoiceVisibility";
