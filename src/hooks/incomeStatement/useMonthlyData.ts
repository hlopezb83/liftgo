import { useMemo } from "react";
import { format, parseISO, isWithinInterval, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { useInvoices } from "@/hooks/useInvoices";
import { useMaintenanceLogs } from "@/hooks/useMaintenanceLogs";
import { useDamageRecords } from "@/hooks/useDamageRecords";
import { useOperatingExpenses } from "@/hooks/useOperatingExpenses";
import { useBookings } from "@/hooks/useBookings";
import { useForklifts } from "@/hooks/useForklifts";
import { useQuotes } from "@/hooks/useQuotes";
import {
  type MonthData, type AccountingBasis, type ExpenseCategory,
  emptyExpenses, computeDerivedTotals,
} from "./types";

interface Props {
  startDate: Date;
  endDate: Date;
  accountingBasis: AccountingBasis;
}

export function useMonthlyData({ startDate, endDate, accountingBasis }: Props) {
  const { data: invoices = [] } = useInvoices();
  const { data: maintenanceLogs = [] } = useMaintenanceLogs();
  const { data: damageRecords = [] } = useDamageRecords();
  const { data: operatingExpenses = [] } = useOperatingExpenses();
  const { data: bookings = [] } = useBookings();
  const { data: forklifts = [] } = useForklifts();
  const { data: quotes = [] } = useQuotes();

  const rentalQuoteIds = useMemo(() => {
    const set = new Set<string>();
    for (const q of quotes) if (q.quote_type === "rental") set.add(q.id);
    return set;
  }, [quotes]);

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

  const data = useMemo((): MonthData[] => {
    type RawMonth = {
      month: string; revenue: number; revenueRental: number; revenueSales: number;
      maintenanceCost: number; damageCost: number;
      expenses: Record<ExpenseCategory, number>;
      rentalByCustomer: Record<string, number>;
      salesByCustomer: Record<string, number>;
    };
    const months: Record<string, RawMonth> = {};

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
        const isRental = !!inv.booking_id || (!!inv.quote_id && rentalQuoteIds.has(inv.quote_id));
        if (isRental) {
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

        const derived = computeDerivedTotals({
          revenue: m.revenue,
          maintenanceCost: m.maintenanceCost,
          damageCost: m.damageCost,
          depreciation,
          expenses: m.expenses,
        });

        return { ...m, monthKey: key, depreciation, depreciationByForklift, ...derived };
      });
  }, [invoices, maintenanceLogs, damageRecords, operatingExpenses, bookings, forkliftDepreciationMap, forkliftNameMap, startDate, endDate, accountingBasis, rentalQuoteIds]);

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

  return { data, rentedWithoutCost };
}
