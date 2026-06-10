import type { LineItem } from "@/lib/domain/invoiceHelpers";

const SALE_SUFFIX = /\s*-\s*Venta de equipo$/i;

export function isSaleLine(description: string): boolean {
  return SALE_SUFFIX.test(description);
}


export function getSaleLines(lineItems: LineItem[]): Array<{ index: number; item: LineItem }> {
  return lineItems
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => isSaleLine(item.description));
}
