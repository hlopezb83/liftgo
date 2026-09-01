
// M-14c: patrón isFxMissing del cash-flow para docs sin tipo de cambio.
import { isFxMissing } from "@/features/cash-flow";
import { toYMD } from "@/lib/date/toYMD";
import { sumMoney, toMxn } from "@/lib/money";
import { visibleListRows } from "@/lib/supabase/constants";
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
  /** FIX A7: facturas sin fecha de vencimiento; no son "Corriente". */
  no_due: number;
  total: number;
}

export interface AgingTotals {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  no_due: number;
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

const EMPTY_TOTALS: AgingTotals = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, no_due: 0, total: 0 };

export function useAgingReport() {
  const { data, isLoading, isError, refetch } = useSupplierBills();

  const { rows, totals, fxMissingCount, noDueDateCount } = (() => {
    const todayYmd = toYMD(nowMty()) ?? "";
    const byId = new Map<string, AgingRow>();
    let fxMissingCount = 0;
    let noDueDateCount = 0;

    // R7-13: mismo universo que los KPIs (sin la fila centinela de paginación).
    for (const b of visibleListRows(data)) {
      // R7 Bloque 6: normalizamos a MXN para no mezclar monedas en buckets/totales.
      const balance = toMxn(Number(b.balance), b.currency, b.exchange_rate);
      // R12-FE-08 (P2 r11): la antigüedad excluye también borradores.
      // QA 2A-3: una factura rechazada en aprobación no es deuda vigente.
      if (b.status === "cancelled" || b.status === "draft" || b.approval_status === "rejected" || balance <= 0) continue;
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
        current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, no_due: 0, total: 0,
      };

      // FIX A7: antes, sin due_date la factura caía en "Corriente" y se veía
      // sana aunque nadie supiera cuándo se paga. Ahora va a su propia columna
      // "Sin vencimiento" para que se capture la fecha faltante.
      // (M-14a: envejecerla desde issue_date inflaba los buckets vencidos.)
      let key: keyof Omit<AgingRow, "supplierId" | "supplierName" | "total">;
      if (b.due_date) {
        key = bucketKey(diffDays(todayYmd, b.due_date));
      } else {
        key = "no_due";
        noDueDateCount += 1;
      }
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
        no_due: sumMoney([acc.no_due, r.no_due]),
        total: sumMoney([acc.total, r.total]),
      }),
      EMPTY_TOTALS,
    );

    return { rows, totals, fxMissingCount, noDueDateCount };
  })();

  // rawBills: lista cruda (limit+1) para ListTruncationNotice en la página (H-10b).
  return { rows, totals, fxMissingCount, noDueDateCount, rawBills: data, isLoading, isError, refetch };
}
