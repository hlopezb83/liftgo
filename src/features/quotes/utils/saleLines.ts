import type { LineItem } from "@/lib/domain/invoiceHelpers";

const SALE_SUFFIX = /\s*-\s*Venta de equipo$/i;

export function isSaleLine(description: string): boolean {
  return SALE_SUFFIX.test(description);
}

export function parseSaleDescription(desc: string): { manufacturer: string; model: string } | null {
  const clean = desc.replace(SALE_SUFFIX, "").trim();
  if (!clean) return null;
  const parts = clean.split(/\s+/);
  if (parts.length < 2) return { manufacturer: "", model: clean };
  const model = parts[parts.length - 1];
  const manufacturer = parts.slice(0, -1).join(" ");
  return { manufacturer, model };
}

export function getSaleLines(lineItems: LineItem[]): Array<{ index: number; item: LineItem }> {
  return lineItems
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => isSaleLine(item.description));
}
