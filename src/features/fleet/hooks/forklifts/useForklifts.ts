import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import type { Forklift } from "@/types/rental";
import { forkliftKeys, statusLogKeys } from "../../lib/queryKeys";

export type { Forklift } from "@/types/rental";

export const statusLogQueries = defineEntityQueries<"status_logs", Forklift[], never>(
  "status_logs",
  {
    list: (filter) => async () => {
      const forkliftId = filter?.forkliftId as string | undefined;
      if (!forkliftId) throw new Error("Forklift ID is required for status logs");
      const { data, error } = await supabase
        .from("status_logs").select("*").eq("forklift_id", forkliftId)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Forklift[];
    },
    staleTime: 60_000,
  },
);

export function useForklifts() {
  return useQuery({
    queryKey: forkliftKeys.lists(),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("forklifts").select("*").is("deleted_at", null).or("is_e2e.is.null,is_e2e.eq.false").order("name");
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
    queryKey: statusLogKeys.byFilter({ forkliftId }),
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
