import { calculateRentalCost, applyDiscountToBase, lineItemTotal } from "@/lib/domain/invoiceHelpers";
import { money } from "@/lib/domain/invoiceTotals";
import { sumMoney } from "@/lib/money";
import type { RentalLine } from "./RentalLineItems";

/**
 * A1-7: el descuento "$" de `applyLineDiscount` (quoteFormBuilders.ts) se
 * distribuye en cascada por CADA partida generada (diaria/semanal/mensual),
 * clamp por partida y redondeando en cada paso con `money`. Antes este
 * estimado aplicaba el descuento una sola vez sobre el subtotal agregado, lo
 * que difiere en centavos del total real guardado al enviar la cotización.
 * Replicamos la misma cascada aquí para que el preview coincida exactamente.
 */
function applyDiscountPerLine(itemTotals: number[], discount: number, discountType: "%" | "$"): number {
  if (!discount || discount <= 0) return sumMoney(itemTotals);
  if (discountType !== "$") {
    return sumMoney(itemTotals.map((t) => applyDiscountToBase(t, discount, discountType)));
  }
  let remaining = discount;
  const results: number[] = [];
  for (const total of itemTotals) {
    const applied = Math.min(remaining, total || 0);
    results.push(money(total).subtract(applied).value);
    remaining = money(remaining).subtract(applied).value;
  }
  return sumMoney(results);
}

export function computeRentalLineTotal(line: RentalLine, startDate?: Date, endDate?: Date): number {
  // R13-FE-01 (P1): partida legacy sin modelo -> mostrar el importe almacenado;
  // recalcular tarifa x periodo altera el precio acordado (COT-0001/0005).
  if (!line.modelId && line.legacyTotal != null) {
    return applyDiscountToBase(lineItemTotal(line.quantity, line.legacyTotal), line.discount, line.discountType);
  }
  if (!startDate || !endDate) return 0;
  const items = calculateRentalCost(line.dailyRate, line.weeklyRate, line.monthlyRate, startDate, endDate);
  // Cantidad aplicada por partida (mismo orden que `generateLineItemsFromModel`),
  // antes de agregar, para que el descuento en cascada opere por partida.
  const perLineTotals = items.map((i) => lineItemTotal(line.quantity, i.total));
  return applyDiscountPerLine(perLineTotals, line.discount ?? 0, (line.discountType ?? "%") as "%" | "$");
}
