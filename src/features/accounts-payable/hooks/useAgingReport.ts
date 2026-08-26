
// M-14c: patrón isFxMissing del cash-flow para docs sin tipo de cambio.
import { isFxMissing } from "@/features/cash-flow/lib/cashFlowTransformers";
import { toYMD } from "@/lib/date/toYMD";
import { sumMoney, toMxn } from "@/lib/money";
import { nowMty } from "@/lib/utils";
import { useSupplierBills } from "./useSupplierBills";

export interface AgingRow {
  supplierId: string;
  supplierName: string;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}

export interface AgingTotals {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}

function diffDays(a: string, b: string): number {
  return Math.floor((new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) / 86_400_000);
}

function bucketKey(overdueDays: number): keyof Omit<AgingRow, "supplierId" | "supplierName" | "total"> {
  if (overdueDays <= 0) return "current";
  if (overdueDays <= 30) return "d1_30";
  if (overdueDays <= 60) return "d31_60";
  if (overdueDays <= 90) return "d61_90";
  return "d90_plus";
}

const EMPTY_TOTALS: AgingTotals = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };

export function useAgingReport() {
  const { data, isLoading, isError, refetch } = useSupplierBills();

  const { rows, totals, fxMissingCount } = (() => {
    const todayYmd = toYMD(nowMty()) ?? "";
    const byId = new Map<string, AgingRow>();
    let fxMissingCount = 0;

    for (const b of data ?? []) {
      // R7 Bloque 6: normalizamos a MXN para no mezclar monedas en buckets/totales.
      const balance = toMxn(Number(b.balance), b.currency, b.exchange_rate);
      // R12-FE-08 (P2 r11): la antigüedad excluye también borradores.
      if (b.status === "cancelled" || b.status === "draft" || balance <= 0) continue;
      // M-14c: moneda foránea sin TC válido ⇒ toMxn devolvió el monto 1:1;
      // envejecerlo distorsiona la cartera. Se excluye del reporte.
      if (isFxMissing(b.currency, b.exchange_rate)) {
        fxMissingCount += 1;
        continue;
      }
      const supplierId = b.supplier_id ?? "sin-proveedor";
      const supplierName = b.suppliers?.name ?? "Sin proveedor";
      const row = byId.get(supplierId) ?? {
        supplierId, supplierName,
        current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0,
      };

      // M-14a: sin due_date la factura es "Corriente" — envejecer desde
      // issue_date inflaba artificialmente los buckets vencidos.
      const key = b.due_date ? bucketKey(diffDays(todayYmd, b.due_date)) : "current";
      // M-14b: acumular con sumMoney (centavos) sin drift IEEE-754.
      row[key] = sumMoney([row[key], balance]);
      row.total = sumMoney([row.total, balance]);
      byId.set(supplierId, row);
    }

    const rows = Array.from(byId.values()).sort((a, b) => b.total - a.total);
    const totals: AgingTotals = rows.reduce<AgingTotals>(
      (acc, r) => ({
        current: sumMoney([acc.current, r.current]),
        d1_30: sumMoney([acc.d1_30, r.d1_30]),
        d31_60: sumMoney([acc.d31_60, r.d31_60]),
        d61_90: sumMoney([acc.d61_90, r.d61_90]),
        d90_plus: sumMoney([acc.d90_plus, r.d90_plus]),
        total: sumMoney([acc.total, r.total]),
      }),
      EMPTY_TOTALS,
    );

    return { rows, totals, fxMissingCount };
  })();

  // rawBills: lista cruda (limit+1) para ListTruncationNotice en la página (H-10b).
  return { rows, totals, fxMissingCount, rawBills: data, isLoading, isError, refetch };
}
