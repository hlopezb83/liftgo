import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type PartInventory = Tables<"parts_inventory">;
export type MaintenancePart = Tables<"maintenance_parts">;

// ─── Parts Inventory CRUD ────────────────────────────────────────────────────

export function usePartsInventory() {
  return useQuery({
    queryKey: ["parts_inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parts_inventory")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreatePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (part: TablesInsert<"parts_inventory">) => {
      const { data, error } = await supabase
        .from("parts_inventory")
        .insert(part)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parts_inventory"] }),
    onError: (err: Error) => {
      import("sonner").then(({ toast }) =>
        toast.error("Error al crear refacción", { description: err.message })
      );
    },
  });
}

export function useUpdatePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<PartInventory>) => {
      const { data, error } = await supabase
        .from("parts_inventory")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parts_inventory"] }),
  });
}

export function useDeletePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("parts_inventory")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parts_inventory"] }),
    onError: (err: Error) => {
      import("sonner").then(({ toast }) =>
        toast.error("Error al eliminar refacción", { description: err.message })
      );
    },
  });
}

// ─── Maintenance Parts (junction) ────────────────────────────────────────────

export function useMaintenanceParts(maintenanceLogId?: string) {
  return useQuery({
    queryKey: ["maintenance_parts", maintenanceLogId],
    enabled: !!maintenanceLogId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_parts")
        .select("*, parts_inventory(name, sku, category)")
        .eq("maintenance_log_id", maintenanceLogId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useAddMaintenancePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: TablesInsert<"maintenance_parts">) => {
      const { data, error } = await supabase
        .from("maintenance_parts")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["maintenance_parts", variables.maintenance_log_id] });
      qc.invalidateQueries({ queryKey: ["parts_inventory"] });
    },
    onError: (err: Error) => {
      import("sonner").then(({ toast }) =>
        toast.error("Error al agregar refacción", { description: err.message })
      );
    },
  });
}
