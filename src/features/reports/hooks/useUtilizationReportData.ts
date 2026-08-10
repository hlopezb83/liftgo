import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toYMD } from "@/lib/date/toYMD";

export interface UnitUtilizationRow {
  [key: string]: unknown;
  id: string;
  name: string;
  bookedDays: number;
  totalDays: number;
  utilization: number;
}

export interface ModelRow {
  model: string;
  units: number;
  available: number;
  rented: number;
  bookedDays: number;
  totalDays: number;
  utilization: number;
}

/**
 * FIX-FE-01: utilización por unidad vía RPC `report_utilization_by_unit`.
 * La unión de días calendario (anti-traslape) se hace en SQL con
 * generate_series + COUNT(DISTINCT), idéntica a countUniqueBookedDays.
 */
export function useUtilizationByUnitReport(startDate: Date, endDate: Date) {
  const start = toYMD(startDate);
  const end = toYMD(endDate);
  return useQuery({
    queryKey: ["report", "utilization-by-unit", start, end],
    queryFn: async (): Promise<UnitUtilizationRow[]> => {
      const { data, error } = await supabase.rpc("report_utilization_by_unit", {
        _start: start,
        _end: end,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.forklift_id,
        name: r.name,
        bookedDays: Number(r.booked_days),
        totalDays: Number(r.total_days),
        utilization: Number(r.utilization),
      }));
    },
  });
}

/**
 * FIX-FE-01: utilización por modelo vía RPC `report_utilization_by_model`.
 * Reemplaza buildUtilizationRows(forklifts, bookings) sobre listas truncadas.
 */
export function useUtilizationByModelReportData(startDate: Date, endDate: Date) {
  const start = toYMD(startDate);
  const end = toYMD(endDate);
  return useQuery({
    queryKey: ["report", "utilization-by-model", start, end],
    queryFn: async (): Promise<ModelRow[]> => {
      const { data, error } = await supabase.rpc("report_utilization_by_model", {
        _start: start,
        _end: end,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        model: r.model,
        units: Number(r.units),
        available: Number(r.available),
        rented: Number(r.rented),
        bookedDays: Number(r.booked_days),
        totalDays: Number(r.total_days),
        utilization: Number(r.utilization),
      }));
    },
  });
}
