import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { forkliftKeys, statusLogKeys } from "../../lib/queryKeys";
import type { Forklift } from "@/types/rental";

export type { Forklift };

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

const STATUS_LOG_COLUMNS = sel("id, forklift_id, status, reason, changed_at, created_by, notes");

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
        .returns<Forklift[]>();
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
