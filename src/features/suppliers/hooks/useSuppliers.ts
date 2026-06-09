import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
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
  default_payment_terms_days: number | null;
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
    staleTime: 5 * 60_000,
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

function translateSupplierError(err: Error): string {
  const msg = err.message || "";
  if (msg.includes("suppliers_rfc_unique_idx") || (msg.includes("duplicate key") && msg.toLowerCase().includes("rfc"))) {
    return "Ya existe un proveedor con ese RFC.";
  }
  return msg;
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (supplier: Omit<Supplier, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("suppliers").insert(supplier).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Proveedor creado");
    },
    onError: (err: Error) => notifyError({ error: err, message: `Error al crear proveedor: ${translateSupplierError(err)}` }),
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Supplier> & { id: string }) => {
      const { data, error } = await supabase.from("suppliers").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Proveedor actualizado");
    },
    onError: (err: Error) => notifyError({ error: err, message: `Error al actualizar proveedor: ${translateSupplierError(err)}` }),
  });
}


