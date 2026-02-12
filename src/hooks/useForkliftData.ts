import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Forklift = Tables<"forklifts">;
export type Booking = Tables<"bookings">;
export type StatusLog = Tables<"status_logs">;

export function useForklifts() {
  return useQuery({
    queryKey: ["forklifts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("forklifts").select("*").order("name");
      if (error) throw error;
      return data as Forklift[];
    },
  });
}

export function useForklift(id: string | undefined) {
  return useQuery({
    queryKey: ["forklifts", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("forklifts").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Forklift;
    },
  });
}

export function useStatusLogs(forkliftId: string | undefined) {
  return useQuery({
    queryKey: ["status_logs", forkliftId],
    enabled: !!forkliftId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("status_logs")
        .select("*")
        .eq("forklift_id", forkliftId!)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data as StatusLog[];
    },
  });
}

export function useBookings(forkliftId?: string) {
  return useQuery({
    queryKey: ["bookings", forkliftId],
    queryFn: async () => {
      let query = supabase.from("bookings").select("*, forklifts(name, model)").order("start_date");
      if (forkliftId) query = query.eq("forklift_id", forkliftId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateForklift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (forklift: TablesInsert<"forklifts">) => {
      const { data, error } = await supabase.from("forklifts").insert(forklift).select().single();
      if (error) throw error;
      // Log initial status
      await supabase.from("status_logs").insert({
        forklift_id: data.id,
        to_status: forklift.status || "available",
        note: "Initial registration",
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forklifts"] }),
  });
}

export function useUpdateForklift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"forklifts"> & { id: string }) => {
      const { data, error } = await supabase.from("forklifts").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["forklifts"] });
      qc.invalidateQueries({ queryKey: ["forklifts", data.id] });
    },
  });
}

export function useUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      forkliftId,
      fromStatus,
      toStatus,
      note,
    }: {
      forkliftId: string;
      fromStatus: string;
      toStatus: string;
      note?: string;
    }) => {
      await supabase.from("forklifts").update({ status: toStatus }).eq("id", forkliftId);
      await supabase.from("status_logs").insert({
        forklift_id: forkliftId,
        from_status: fromStatus,
        to_status: toStatus,
        note,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forklifts"] });
      qc.invalidateQueries({ queryKey: ["status_logs"] });
    },
  });
}
