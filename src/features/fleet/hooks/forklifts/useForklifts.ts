import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { forkliftKeys } from "@/features/fleet/lib/queryKeys";

export type { Forklift } from "@/types/rental";

export function useForklifts() {
  return useQuery({
    queryKey: forkliftKeys.lists(),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("forklifts").select("*").or("is_e2e.is.null,is_e2e.eq.false").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useForklift(id: string | undefined) {
  return useQuery({
    queryKey: id ? forkliftKeys.detail(id) : forkliftKeys.details(),
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("Forklift ID is required");
      const { data, error } = await supabase.from("forklifts").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useStatusLogs(forkliftId: string | undefined) {
  return useQuery({
    queryKey: ["status_logs", forkliftId],
    enabled: !!forkliftId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!forkliftId) throw new Error("Forklift ID is required for status logs");
      const { data, error } = await supabase
        .from("status_logs").select("*").eq("forklift_id", forkliftId)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export {
  useCreateForklift,
  useUpdateForklift,
  useDeleteForklift,
  useUpdateStatus,
} from "./useForkliftMutations";
