import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  rfc: string | null;
  regimen_fiscal: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const SUPPLIER_CATEGORIES: Record<string, string> = {
  refacciones: "Refacciones",
  mantenimiento: "Mantenimiento",
  combustible: "Combustible",
  transporte: "Transporte",
  otro: "Otro",
};

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supplier: Omit<Supplier, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("suppliers").insert(supplier).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Proveedor creado");
    },
    onError: (err: Error) => toast.error(`Error al crear proveedor: ${err.message}`),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Supplier> & { id: string }) => {
      const { data, error } = await supabase.from("suppliers").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Proveedor actualizado");
    },
    onError: (err: Error) => toast.error(`Error al actualizar proveedor: ${err.message}`),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Proveedor eliminado");
    },
    onError: (err: Error) => toast.error(`Error al eliminar proveedor: ${err.message}`),
  });
}
