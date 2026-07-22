import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Forklift } from "@/types/rental";
import { forkliftKeys, statusLogKeys } from "../../lib/queryKeys";

export type { Forklift };

const sel = (s: string): string => s;

const FORKLIFT_COLUMNS = sel(
  "id, name, model, manufacturer, year, capacity_kg, mast_height_m, fuel_type, serial_number, status, daily_rate, weekly_rate, monthly_rate, image_url, notes, created_at, updated_at, acquisition_cost, insurance_provider, insurance_policy_number, insurance_expiry, insurance_cost, is_e2e, e2e_scope, deleted_at, deleted_by, acquisition_date, sold_at"
);

const STATUS_LOG_COLUMNS = sel("id, forklift_id, from_status, to_status, changed_at, note");

export function useForklifts() {
  return useQuery({
    queryKey: forkliftKeys.lists(),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forklifts")
        .select(FORKLIFT_COLUMNS)
        .is("deleted_at", null)
        .or("is_e2e.is.null,is_e2e.eq.false")
        .order("name")
        .returns<Forklift[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useForklift(id: string | undefined) {
  return useQuery({
    queryKey: id ? forkliftKeys.detail(id) : forkliftKeys.details(),
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("Forklift ID is required");
      const { data, error } = await supabase
        .from("forklifts")
        .select(FORKLIFT_COLUMNS)
        .eq("id", id)
        .single()
        .returns<Forklift>();
      if (error) throw error;
      return data;
    },
  });
}

export function useStatusLogs(forkliftId: string | undefined) {
  return useQuery({
    queryKey: statusLogKeys.byFilter({ forkliftId }),
    enabled: !!forkliftId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!forkliftId) throw new Error("Forklift ID is required for status logs");
      const { data, error } = await supabase
        .from("status_logs")
        .select(STATUS_LOG_COLUMNS)
        .eq("forklift_id", forkliftId)
        .order("changed_at", { ascending: false })
        .returns<Tables<"status_logs">[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export {
  useCreateForklift,
  useUpdateForklift,
  useDeleteForklift,
  useUpdateStatus,
} from "./useForkliftMutations";
