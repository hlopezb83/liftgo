import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

export function formatBankAmount(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase();
  const formatted = formatCurrencyWithCode(amount, code);
  return formatted === "—" || formatted.includes(code) ? formatted : `${formatted} ${code}`;
}
