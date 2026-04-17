import { useMemo, useState } from "react";
import { format, parseISO, isWithinInterval, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { useInvoices } from "@/hooks/useInvoices";
import { useMaintenanceLogs } from "@/hooks/useMaintenanceLogs";
import { useDamageRecords } from "@/hooks/useDamageRecords";
import { useOperatingExpenses, EXPENSE_CATEGORY_LABELS } from "@/hooks/useOperatingExpenses";
import type { ExpenseCategory } from "@/hooks/useOperatingExpenses";
import { useBookings } from "@/hooks/useBookings";
import { useForklifts } from "@/hooks/useForklifts";


const EXPENSE_CATEGORIES: ExpenseCategory[] = ["renta", "nomina", "caja_chica", "publicidad", "otro"];
const DIRECT_COST_CATEGORIES: ExpenseCategory[] = ["costo_venta"];

export interface MonthData {
  monthKey: string;
  month: string;
  revenue: number;
  revenueRental: number;
  revenueSales: number;
  maintenanceCost: number;
  damageCost: number;
  depreciation: number;
  depreciationByForklift: Record<string, number>;
  rentalByCustomer: Record<string, number>;
  salesByCustomer: Record<string, number>;
  grossProfit: number;
  grossMargin: number;
  expenses: Record<ExpenseCategory, number>;
  totalExpenses: number;
  netProfit: number;
  margin: number;
}

export interface StatementRow {
  label: string;
  values: number[];
  total: number;
  isSubtotal?: boolean;
  isCost?: boolean;
  isPercent?: boolean;
}

export interface YearTotals {
  year: string;
  revenue: number;
  revenueRental: number;
  revenueSales: number;
  maintenanceCost: number;
  damageCost: number;
  depreciation: number;
  expenses: Record<ExpenseCategory, number>;
  grossProfit: number;
  grossMargin: number;
  totalExpenses: number;
  netProfit: number;
  margin: number;
}

export interface ComparisonRow {
  label: string;
  yearValues: number[];
  delta: number;
  deltaPct: number | null;
  isSubtotal?: boolean;
  isCost?: boolean;
  isPercent?: boolean;
}

interface UseIncomeStatementDataProps {
  startDate: Date;
  endDate: Date;
  accountingBasis?: "accrual" | "cash";
}

export { EXPENSE_CATEGORIES, DIRECT_COST_CATEGORIES, EXPENSE_CATEGORY_LABELS };

export function useIncomeStatementData({ startDate, endDate, accountingBasis = "accrual" }: UseIncomeStatementDataProps) {
  const { data: invoices = [] } = useInvoices();
  const { data: maintenanceLogs = [] } = useMaintenanceLogs();
  const { data: damageRecords = [] } = useDamageRecords();
  const { data: operatingExpenses = [] } = useOperatingExpenses();
  const { data: bookings = [] } = useBookings();
  const { data: forklifts = [] } = useForklifts();

  const forkliftNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const fl of forklifts) map.set(fl.id, fl.name);
    return map;
  }, [forklifts]);

  const forkliftDepreciationMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const fl of forklifts) {
      const cost = Number(fl.acquisition_cost ?? 0);
      if (cost > 0) map.set(fl.id, cost / 36);
    }
    return map;
  }, [forklifts]);

  const data = useMemo(() => {
    const months: Record<string, { month: string; revenue: number; revenueRental: number; revenueSales: number; maintenanceCost: number; damageCost: number; expenses: Record<ExpenseCategory, number>; rentalByCustomer: Record<string, number>; salesByCustomer: Record<string, number> }> = {};

    const emptyExpenses = (): Record<ExpenseCategory, number> => ({ renta: 0, nomina: 0, software: 0, depreciacion: 0, otro: 0, costo_venta: 0, caja_chica: 0, publicidad: 0 });

    const ensureMonth = (date: Date) => {
      const key = format(startOfMonth(date), "yyyy-MM");
      if (!months[key]) {
        months[key] = {
          month: format(startOfMonth(date), "MMM yyyy", { locale: es }),
          revenue: 0, revenueRental: 0, revenueSales: 0,
          maintenanceCost: 0, damageCost: 0, expenses: emptyExpenses(),
          rentalByCustomer: {}, salesByCustomer: {},
        };
      }
      return key;
    };

    const isCash = accountingBasis === "cash";

    invoices
      .filter((inv) => isCash
        ? inv.status === "paid" && !!inv.paid_at
        : inv.status !== "draft" && inv.status !== "cancelled"
      )
      .filter((inv) => {
        const dateStr = isCash ? inv.paid_at! : inv.issued_at;
        return isWithinInterval(parseISO(dateStr), { start: startDate, end: endDate });
      })
      .forEach((inv) => {
        const dateStr = isCash ? inv.paid_at! : inv.issued_at;
        const key = ensureMonth(parseISO(dateStr));
        const subtotal = Number(inv.subtotal);
        const customerName = inv.customer_name || "Sin cliente";
        months[key].revenue += subtotal;
        if (inv.booking_id) {
          months[key].revenueRental += subtotal;
          months[key].rentalByCustomer[customerName] = (months[key].rentalByCustomer[customerName] ?? 0) + subtotal;
        } else {
          months[key].revenueSales += subtotal;
          months[key].salesByCustomer[customerName] = (months[key].salesByCustomer[customerName] ?? 0) + subtotal;
        }
      });

    maintenanceLogs
      .filter((ml) => isWithinInterval(parseISO(ml.performed_at), { start: startDate, end: endDate }))
      .forEach((ml) => {
        const key = ensureMonth(parseISO(ml.performed_at));
        months[key].maintenanceCost += Number(ml.cost ?? 0);
      });

    damageRecords
      .filter((dr) => isWithinInterval(parseISO(dr.created_at), { start: startDate, end: endDate }))
      .forEach((dr) => {
        const key = ensureMonth(parseISO(dr.created_at));
        months[key].damageCost += Number(dr.actual_cost ?? 0);
      });

    operatingExpenses
      .filter((oe) => isWithinInterval(parseISO(oe.expense_date), { start: startDate, end: endDate }))
      .forEach((oe) => {
        const key = ensureMonth(parseISO(oe.expense_date));
        months[key].expenses[oe.category] += Number(oe.amount);
      });

    const activeBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, m]): MonthData => {
        const monthStart = `${key}-01`;
        const [yyyy, mm] = key.split("-").map(Number);
        const lastDay = new Date(yyyy, mm, 0).getDate();
        const monthEnd = `${key}-${String(lastDay).padStart(2, "0")}`;

        const rentedForkliftIds = new Set<string>();
        for (const b of activeBookings) {
          if (b.start_date <= monthEnd && b.end_date >= monthStart) {
            rentedForkliftIds.add(b.forklift_id);
          }
        }

        let depreciation = 0;
        const depreciationByForklift: Record<string, number> = {};
        for (const fid of rentedForkliftIds) {
          const amt = forkliftDepreciationMap.get(fid) ?? 0;
          if (amt > 0) {
            depreciation += amt;
            const name = forkliftNameMap.get(fid) ?? fid;
            depreciationByForklift[name] = amt;
          }
        }

        const costoVenta = DIRECT_COST_CATEGORIES.reduce((s, c) => s + m.expenses[c], 0);
        const grossProfit = m.revenue - m.maintenanceCost - m.damageCost - costoVenta;
        const grossMargin = m.revenue > 0 ? (grossProfit / m.revenue) * 100 : 0;
        const opexTotal = EXPENSE_CATEGORIES.reduce((s, c) => s + m.expenses[c], 0);
        const totalExpenses = m.maintenanceCost + m.damageCost + costoVenta + opexTotal;
        const netProfit = m.revenue - totalExpenses - depreciation;
        const margin = m.revenue > 0 ? (netProfit / m.revenue) * 100 : 0;
        return { ...m, monthKey: key, depreciation, depreciationByForklift, grossProfit, grossMargin, totalExpenses, netProfit, margin };
      });
  }, [invoices, maintenanceLogs, damageRecords, operatingExpenses, bookings, forkliftDepreciationMap, forkliftNameMap, startDate, endDate, accountingBasis]);

  const availableYears = useMemo(() => {
    return [...new Set(data.map((d) => d.monthKey.substring(0, 4)))].sort();
  }, [data]);

  const [selectedYear, setSelectedYear] = useState<string>("all");
  const isComparison = selectedYear === "compare";

  const filteredData = useMemo(() => {
    if (selectedYear === "all" || selectedYear === "compare") return data;
    return data.filter((d) => d.monthKey.startsWith(selectedYear));
  }, [data, selectedYear]);

  const totals = useMemo(() => {
    const allCats = [...EXPENSE_CATEGORIES, ...DIRECT_COST_CATEGORIES];
    const t = filteredData.reduce(
      (acc, r) => {
        const expenses = { ...acc.expenses };
        allCats.forEach((c) => { expenses[c] = (expenses[c] || 0) + r.expenses[c]; });
        return {
          revenue: acc.revenue + r.revenue,
          revenueRental: acc.revenueRental + r.revenueRental,
          revenueSales: acc.revenueSales + r.revenueSales,
          maintenanceCost: acc.maintenanceCost + r.maintenanceCost,
          damageCost: acc.damageCost + r.damageCost,
          depreciation: acc.depreciation + r.depreciation,
          expenses,
        };
      },
      { revenue: 0, revenueRental: 0, revenueSales: 0, maintenanceCost: 0, damageCost: 0, depreciation: 0, expenses: { renta: 0, nomina: 0, software: 0, depreciacion: 0, caja_chica: 0, publicidad: 0, otro: 0, costo_venta: 0 } as Record<ExpenseCategory, number> }
    );
    const costoVenta = DIRECT_COST_CATEGORIES.reduce((s, c) => s + t.expenses[c], 0);
    const grossProfit = t.revenue - t.maintenanceCost - t.damageCost - costoVenta;
    const grossMargin = t.revenue > 0 ? (grossProfit / t.revenue) * 100 : 0;
    const opexTotal = EXPENSE_CATEGORIES.reduce((s, c) => s + t.expenses[c], 0);
    const totalExpenses = t.maintenanceCost + t.damageCost + costoVenta + opexTotal;
    const netProfit = t.revenue - totalExpenses - t.depreciation;
    const margin = t.revenue > 0 ? (netProfit / t.revenue) * 100 : 0;
    return { ...t, grossProfit, grossMargin, totalExpenses, netProfit, margin };
  }, [filteredData]);

  const yearTotals = useMemo((): YearTotals[] => {
    if (!isComparison) return [];
    return availableYears.map((year) => {
      const yearData = data.filter((d) => d.monthKey.startsWith(year));
      const allCats = [...EXPENSE_CATEGORIES, ...DIRECT_COST_CATEGORIES];
      const t = yearData.reduce(
        (acc, r) => {
          const expenses = { ...acc.expenses };
          allCats.forEach((c) => { expenses[c] = (expenses[c] || 0) + r.expenses[c]; });
          return { revenue: acc.revenue + r.revenue, revenueRental: acc.revenueRental + r.revenueRental, revenueSales: acc.revenueSales + r.revenueSales, maintenanceCost: acc.maintenanceCost + r.maintenanceCost, damageCost: acc.damageCost + r.damageCost, depreciation: acc.depreciation + r.depreciation, expenses };
        },
        { revenue: 0, revenueRental: 0, revenueSales: 0, maintenanceCost: 0, damageCost: 0, depreciation: 0, expenses: { renta: 0, nomina: 0, software: 0, depreciacion: 0, caja_chica: 0, publicidad: 0, otro: 0, costo_venta: 0 } as Record<ExpenseCategory, number> }
      );
      const costoVenta = DIRECT_COST_CATEGORIES.reduce((s, c) => s + t.expenses[c], 0);
      const grossProfit = t.revenue - t.maintenanceCost - t.damageCost - costoVenta;
      const grossMargin = t.revenue > 0 ? (grossProfit / t.revenue) * 100 : 0;
      const opexTotal = EXPENSE_CATEGORIES.reduce((s, c) => s + t.expenses[c], 0);
      const totalExpenses = t.maintenanceCost + t.damageCost + costoVenta + opexTotal;
      const netProfit = t.revenue - totalExpenses - t.depreciation;
      const margin = t.revenue > 0 ? (netProfit / t.revenue) * 100 : 0;
      return { year, ...t, grossProfit, grossMargin, totalExpenses, netProfit, margin };
    });
  }, [isComparison, availableYears, data]);

  const comparisonRows = useMemo((): ComparisonRow[] => {
    if (yearTotals.length < 2) return [];
    const getValues = (extractor: (yt: YearTotals) => number, opts?: { isCost?: boolean; isSubtotal?: boolean; isPercent?: boolean }) => {
      const vals = yearTotals.map(extractor);
      const last = vals[vals.length - 1];
      const prev = vals[vals.length - 2];
      const delta = last - prev;
      const deltaPct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : null;
      return { yearValues: vals, delta, deltaPct, ...opts };
    };
    return [
      { label: "  Ingresos por Rentas", ...getValues((yt) => yt.revenueRental) },
      { label: "  Ingresos por Ventas", ...getValues((yt) => yt.revenueSales) },
      { label: "= Total Ingresos", ...getValues((yt) => yt.revenue, { isSubtotal: true }) },
      { label: "(-) Mantenimiento", ...getValues((yt) => yt.maintenanceCost, { isCost: true }) },
      { label: "(-) Daños", ...getValues((yt) => yt.damageCost, { isCost: true }) },
      ...DIRECT_COST_CATEGORIES.map((c) => ({
        label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
        ...getValues((yt) => yt.expenses[c], { isCost: true }),
      })),
      { label: "= Utilidad Bruta", ...getValues((yt) => yt.grossProfit, { isSubtotal: true }) },
      { label: "Margen Bruto", ...getValues((yt) => yt.grossMargin, { isPercent: true }) },
      ...EXPENSE_CATEGORIES.map((c) => ({
        label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
        ...getValues((yt) => yt.expenses[c], { isCost: true }),
      })),
      { label: "= Total Egresos", ...getValues((yt) => yt.totalExpenses, { isSubtotal: true, isCost: true }) },
      { label: "(-) Depreciación (Equipos Rentados)", ...getValues((yt) => yt.depreciation, { isCost: true }) },
      { label: "= Utilidad Neta", ...getValues((yt) => yt.netProfit, { isSubtotal: true }) },
      { label: "Margen Neto", ...getValues((yt) => yt.margin, { isPercent: true }) },
    ];
  }, [yearTotals]);

  const statementRows: StatementRow[] = useMemo(() => [
    { label: "  Ingresos por Rentas", values: filteredData.map((r) => r.revenueRental), total: totals.revenueRental },
    { label: "  Ingresos por Ventas", values: filteredData.map((r) => r.revenueSales), total: totals.revenueSales },
    { label: "= Total Ingresos", values: filteredData.map((r) => r.revenue), total: totals.revenue, isSubtotal: true },
    { label: "(-) Mantenimiento", values: filteredData.map((r) => r.maintenanceCost), total: totals.maintenanceCost, isCost: true },
    { label: "(-) Daños", values: filteredData.map((r) => r.damageCost), total: totals.damageCost, isCost: true },
    ...DIRECT_COST_CATEGORIES.map((c) => ({
      label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
      values: filteredData.map((r) => r.expenses[c]),
      total: totals.expenses[c],
      isCost: true,
    })),
    { label: "= Utilidad Bruta", values: filteredData.map((r) => r.grossProfit), total: totals.grossProfit, isSubtotal: true },
    { label: "Margen Bruto", values: filteredData.map((r) => r.grossMargin), total: totals.grossMargin, isPercent: true },
    ...EXPENSE_CATEGORIES.map((c) => ({
      label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
      values: filteredData.map((r) => r.expenses[c]),
      total: totals.expenses[c],
      isCost: true,
    })),
    { label: "= Total Egresos", values: filteredData.map((r) => r.totalExpenses), total: totals.totalExpenses, isSubtotal: true, isCost: true },
    { label: "(-) Depreciación (Equipos Rentados)", values: filteredData.map((r) => r.depreciation), total: totals.depreciation, isCost: true },
    { label: "= Utilidad Neta", values: filteredData.map((r) => r.netProfit), total: totals.netProfit, isSubtotal: true },
    { label: "Margen Neto", values: filteredData.map((r) => r.margin), total: totals.margin, isPercent: true },
  ], [filteredData, totals]);

  const csvRows = statementRows.map((row) => {
    const obj: Record<string, string> = { Concepto: row.label };
    filteredData.forEach((d, i) => {
      obj[d.month] = row.isPercent ? `${row.values[i].toFixed(1)}%` : row.values[i].toFixed(2);
    });
    obj["Total"] = row.isPercent ? `${row.total.toFixed(1)}%` : row.total.toFixed(2);
    return obj;
  });

  const depreciationBreakdownRows = useMemo((): StatementRow[] => {
    const allNames = new Set<string>();
    filteredData.forEach((r) => {
      Object.keys(r.depreciationByForklift).forEach((n) => allNames.add(n));
    });
    return [...allNames].sort().map((name): StatementRow => ({
      label: `      ${name}`,
      values: filteredData.map((r) => r.depreciationByForklift[name] ?? 0),
      total: filteredData.reduce((s, r) => s + (r.depreciationByForklift[name] ?? 0), 0),
      isCost: true,
    }));
  }, [filteredData]);

  const rentedWithoutCost = useMemo(() => {
    const activeBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
    const rentedIds = new Set<string>();
    activeBookings.forEach((b) => {
      if (b.start_date <= format(endDate, "yyyy-MM-dd") && b.end_date >= format(startDate, "yyyy-MM-dd")) {
        rentedIds.add(b.forklift_id);
      }
    });
    return forklifts.filter(
      (fl) => rentedIds.has(fl.id) && Number(fl.acquisition_cost ?? 0) === 0
    );
  }, [bookings, forklifts, startDate, endDate]);

  return {
    data,
    filteredData,
    totals,
    statementRows,
    comparisonRows,
    yearTotals,
    csvRows,
    depreciationBreakdownRows,
    rentedWithoutCost,
    availableYears,
    selectedYear,
    setSelectedYear,
    isComparison,
  };
}
