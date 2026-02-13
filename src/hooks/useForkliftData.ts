import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Forklift = Tables<"forklifts">;
export type Booking = Tables<"bookings">;
export type StatusLog = Tables<"status_logs">;
export type Customer = Tables<"customers">;
export type MaintenanceLog = Tables<"maintenance_logs">;

// ─── Forklifts ────────────────────────────────────────

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

export function useCreateForklift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (forklift: TablesInsert<"forklifts">) => {
      const { data, error } = await supabase.from("forklifts").insert(forklift).select().single();
      if (error) throw error;
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

export function useDeleteForklift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("status_logs").delete().eq("forklift_id", id);
      await supabase.from("maintenance_logs").delete().eq("forklift_id", id);
      await supabase.from("bookings").delete().eq("forklift_id", id);
      const { error } = await supabase.from("forklifts").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["forklifts"] });
      const previous = qc.getQueryData<Forklift[]>(["forklifts"]);
      qc.setQueryData<Forklift[]>(["forklifts"], (old) => old?.filter((f) => f.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) qc.setQueryData(["forklifts"], context.previous);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forklifts"] }),
  });
}

export function useUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      forkliftId, fromStatus, toStatus, note,
    }: { forkliftId: string; fromStatus: string; toStatus: string; note?: string }) => {
      await supabase.from("forklifts").update({ status: toStatus }).eq("id", forkliftId);
      await supabase.from("status_logs").insert({
        forklift_id: forkliftId, from_status: fromStatus, to_status: toStatus, note,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forklifts"] });
      qc.invalidateQueries({ queryKey: ["status_logs"] });
    },
  });
}

// ─── Status Logs ──────────────────────────────────────

export function useStatusLogs(forkliftId: string | undefined) {
  return useQuery({
    queryKey: ["status_logs", forkliftId],
    enabled: !!forkliftId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("status_logs").select("*").eq("forklift_id", forkliftId!)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data as StatusLog[];
    },
  });
}

// ─── Bookings ─────────────────────────────────────────

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

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (booking: TablesInsert<"bookings">) => {
      const { data, error } = await supabase.from("bookings").insert(booking).select().single();
      if (error) throw error;
      // Update forklift status to "rented"
      await supabase.from("forklifts").update({ status: "rented" }).eq("id", booking.forklift_id);
      await supabase.from("status_logs").insert({
        forklift_id: booking.forklift_id,
        from_status: "available",
        to_status: "rented",
        note: "Booked",
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["forklifts"] });
      qc.invalidateQueries({ queryKey: ["status_logs"] });
    },
  });
}

// ─── Customers ────────────────────────────────────────

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customer: TablesInsert<"customers">) => {
      const { data, error } = await supabase.from("customers").insert(customer).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"customers"> & { id: string }) => {
      const { data, error } = await supabase.from("customers").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

// ─── Maintenance Logs ─────────────────────────────────

export function useMaintenanceLogs(forkliftId?: string) {
  return useQuery({
    queryKey: ["maintenance_logs", forkliftId],
    queryFn: async () => {
      let query = supabase.from("maintenance_logs").select("*").order("performed_at", { ascending: false });
      if (forkliftId) query = query.eq("forklift_id", forkliftId);
      const { data, error } = await query;
      if (error) throw error;
      return data as MaintenanceLog[];
    },
  });
}

export function useCreateMaintenanceLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (log: TablesInsert<"maintenance_logs">) => {
      const { data, error } = await supabase.from("maintenance_logs").insert(log).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance_logs"] }),
  });
}

// ─── Invoices ─────────────────────────────────────────

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ["invoices", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoice: Omit<TablesInsert<"invoices">, "invoice_number">) => {
      // Get next invoice number
      const { data: numData, error: numError } = await supabase.rpc("next_invoice_number");
      if (numError) throw numError;
      const { data, error } = await supabase
        .from("invoices")
        .insert({ ...invoice, invoice_number: numData as string })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"invoices"> & { id: string }) => {
      const { data, error } = await supabase.from("invoices").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices", data.id] });
    },
  });
}
