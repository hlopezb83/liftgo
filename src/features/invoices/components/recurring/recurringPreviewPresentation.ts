import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { applyVat, resolveVatRatePercent, sumMoney } from "@/lib/money";
import type { RecurringPreviewLine } from "../../hooks/invoices/recurring/usePreviewRecurringInvoices";

export interface RecurringCustomerGroup {
  key: string;
  customer: string;
  lines: RecurringPreviewLine[];
}

export function recurringCurrency(line: RecurringPreviewLine): string {
  return line.currency?.trim().toUpperCase() || "MXN";
}

/** No unir clientes distintos sólo porque comparten el nombre visible. */
export function buildCustomerGroups(lines: RecurringPreviewLine[]): RecurringCustomerGroup[] {
  const byId = new Map<string, { customer: string; lines: RecurringPreviewLine[] }>();
  for (const line of lines) {
    const key = line.customerId ?? `missing:${line.bookingId}`;
    const group = byId.get(key) ?? { customer: line.customerName ?? "Sin cliente", lines: [] };
    group.lines.push(line);
    byId.set(key, group);
  }

  const nameCounts = new Map<string, number>();
  for (const group of byId.values()) {
    nameCounts.set(group.customer, (nameCounts.get(group.customer) ?? 0) + 1);
  }

  return Array.from(byId.entries())
    .sort((a, b) => a[1].customer.localeCompare(b[1].customer, "es") || a[0].localeCompare(b[0]))
    .map(([key, group]) => ({
      key,
      customer: (nameCounts.get(group.customer) ?? 0) > 1
        ? `${group.customer} · ${group.lines[0].bookingCode ?? group.lines[0].bookingId.slice(0, 8)}`
        : group.customer,
      lines: group.lines,
    }));
}

/** Sólo renta e IVA; extras de la primera factura se añaden en el servidor. */
export function rentalTotalsLabel(lines: RecurringPreviewLine[]): string {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const currency = recurringCurrency(line);
    const vatRate = resolveVatRatePercent(line.taxRate) / 100;
    totals.set(currency, sumMoney([totals.get(currency) ?? 0, applyVat(line.billedAmount, vatRate)]));
  }
  if (totals.size === 0) return `${formatCurrencyWithCode(0, "MXN")} MXN`;
  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => `${formatCurrencyWithCode(amount, currency)} ${currency}`)
    .join(" · ");
}
