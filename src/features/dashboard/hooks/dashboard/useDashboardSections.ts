
import { differenceInDays, parseISO } from "date-fns";
import { useServerTodayMty, computeFleetAvailability } from "@/features/availability";
import { useBookings } from "@/features/bookings";
import { useForklifts, useInsuranceAlerts } from "@/features/fleet";
import { useUpcomingInvoices } from "@/features/invoices";
import { useUserRole } from "@/features/users";
import { toMxn } from "@/lib/money";
import { nowMty } from "@/lib/utils";
import {
  EMPTY_COUNTS,
  buildPieData,
  buildStatCards,
  mapMaintenanceAlerts,
  mapInvoiceBreakdown,
  mapMonthlyUtilization,
  mapRevenuePerUnit,
  mapCashFlow,
  buildFinancials,
  buildAlertsProps,
  computeUtilizationPercent,
  financialSectionState,
} from "../../lib/dashboardSectionHelpers";
import { useDashboardStats } from "../useDashboardStats";
import { useFinancialKpis } from "../useFinancialKpis";

function bucketFor(days: number): "0-30" | "31-60" | "61-90" | "90+" {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function computeAgingBuckets(
  overdueInvoices: Array<{
    due_date: string;
    total: number | string;
    balance?: number | string | null;
    balance_mxn?: number | string | null;
    moneda?: string | null;
    tipo_cambio?: number | string | null;
    fx_missing?: boolean | null;
  }>,
) {
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const inv of overdueInvoices) {
    const days = differenceInDays(nowMty(), parseISO(inv.due_date));
    // BL-1.1 R5: usar balance_mxn calculado en `v_invoices_with_balance`
    // para no sumar USD como si fueran MXN.
    // FIX-FE-08: el fallback también debe convertir — sin toMxn una factura en
    // USD sin balance_mxn entraba al bucket como si fueran pesos (~18× menos).
    // H-2: factura en divisa sin tipo de cambio → se excluye del bucket en
    // vez de sumarse 1:1 como si fueran pesos.
    if (inv.fx_missing === true) continue;
    const amount = inv.balance_mxn != null
      ? Number(inv.balance_mxn)
      : toMxn(
          inv.balance != null ? Number(inv.balance) : Number(inv.total),
          inv.moneda,
          inv.tipo_cambio,
        );
    buckets[bucketFor(days)] += amount;
  }
  return Object.entries(buckets).map(([range, total]) => ({ range, total })).filter((b) => b.total > 0);
}

/**
 * Centraliza derivaciones del dashboard. Toda la lógica de mapping pura vive
 * en `dashboardSectionHelpers` para mantener este hook declarativo.
 */
/** Roles con acceso a KPIs financieros y a alertas de seguros (espejo de las RPC). */
function dashboardAccess(role: string | null | undefined) {
  const canSeeFinancials = role === "admin" || role === "administrativo" || role === "auditor";
  return {
    canSeeFinancials,
    // R6-FE-03: get_insurance_alerts admite además dispatcher/mechanic. Ventas queda fuera.
    canSeeInsuranceAlerts: canSeeFinancials || role === "dispatcher" || role === "mechanic",
  };
}

/** R6-FE-07: `rented` de la RPC usa CURRENT_DATE del servidor (otra TZ); se
 *  sobrescribe con la definición única compartida (booking confirmed hoy MTY). */
function mergeFleetCounts(
  baseCounts: typeof EMPTY_COUNTS,
  availability: ReturnType<typeof computeFleetAvailability>,
) {
  if (!availability) return baseCounts;
  return {
    ...baseCounts,
    rented: availability.rented,
    available: availability.available,
    maintenance: availability.maintenance,
  };
}

export function useDashboardSections() {
  const { data: stats, isLoading, isError, isFetching, refetch } = useDashboardStats();
  // R14-L: mismos roles que admite get_financial_kpis (20260725050634).
  const { data: role } = useUserRole();
  const { canSeeFinancials, canSeeInsuranceAlerts } = dashboardAccess(role);
  // Bug 6: exponer loading/error de los KPIs financieros — su query es
  // independiente de `useDashboardStats` y sin guard propio la sección
  // Finanzas renderizaba ceros falsos ($0) durante carga o fallo del RPC.
  const kpisQuery = useFinancialKpis(canSeeFinancials);
  const kpis = kpisQuery.data;
  const { data: insuranceData } = useInsuranceAlerts(canSeeInsuranceAlerts);
  // GUI-FE-05: ventas no consulta facturas (rol SELECT-only-denied → toast Forbidden).
  const { data: upcomingInvoices } = useUpcomingInvoices(canSeeFinancials);

  const { data: forklifts } = useForklifts();
  const { data: bookings } = useBookings();
  // R10.9: fecha "hoy" resuelta en servidor — evita que un reloj/TZ mal
  // configurado en el navegador corra las unidades rentadas/disponibles.
  const todayYmd = useServerTodayMty();
  const counts = mergeFleetCounts(
    stats?.fleet_counts ?? EMPTY_COUNTS,
    computeFleetAvailability(forklifts, bookings, todayYmd),
  );
  const activeFleet = counts.total - counts.retired - counts.sold;
  const utilizationPercent = computeUtilizationPercent(counts, activeFleet);

  const overdueInvoices = stats?.overdue_invoices ?? [];


  // Nota: React Compiler memoiza las derivaciones puras siguientes.
  // Sólo conservamos useMemo para `counts` y `overdueInvoices` porque
  // sus identidades alimentan cascadas y queremos garantía manual.
  return {
    isLoading,
    isError,
    isFetching,
    refetch,
    insuranceData,
    utilizationPercent,
    overdueInvoices,
    canSeeFinancials,
    outstandingRevenue: stats?.invoice_stats?.outstanding_revenue ?? 0,
    statCards: buildStatCards(counts, activeFleet),
    pieData: buildPieData(counts),
    agingBuckets: computeAgingBuckets(overdueInvoices),
    maintenanceAlerts: mapMaintenanceAlerts(stats?.maintenance_alerts),
    monthlyUtilization: mapMonthlyUtilization(stats),
    revenuePerUnit: mapRevenuePerUnit(stats),
    invoiceBreakdown: mapInvoiceBreakdown(stats?.invoice_stats?.breakdown),
    cashFlowData: mapCashFlow(stats),
    financials: buildFinancials(kpis),
    // Bug 6: la página decide skeleton/error para la sección Finanzas.
    financialsState: financialSectionState({
      isError: kpisQuery.isError,
      isLoading: kpisQuery.isLoading,
    }),
    financialsIsFetching: kpisQuery.isFetching,
    refetchFinancials: kpisQuery.refetch,
    alertsProps: buildAlertsProps(stats, upcomingInvoices, kpis),
  };
}
