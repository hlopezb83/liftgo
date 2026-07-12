import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";


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

export const suppliersQueries = defineEntityQueries<"suppliers", Supplier[], never>("suppliers", {
  staleTime: 5 * 60_000,
  list: () => async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .is("deleted_at", null)
      .order("name");
    if (error) throw error;
    return data as Supplier[];
  },
});

export function useSuppliers() {
  return useQuery(suppliersQueries.list());
}

// Nota: `useDeleteSupplier` se retiró por estar sin uso. La eliminación se
// invoca directamente desde la página de proveedores vía el RPC soft delete.


function translateSupplierError(err: Error): string {
  const msg = err.message || "";
  if (msg.includes("suppliers_rfc_unique_idx") || (msg.includes("duplicate key") && msg.toLowerCase().includes("rfc"))) {
    return "Ya existe un proveedor con ese RFC.";
  }
  return msg;
}

export function useCreateSupplier() {
  return useEntityMutation({
    mutationFn: async (supplier: Omit<Supplier, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("suppliers").insert(supplier).select().single();
      if (error) throw new Error(translateSupplierError(error));
      return data;
    },
    invalidateKeys: [suppliersQueries.keys.all],
    successMsg: "Proveedor creado",
    errorTitle: "Error al crear proveedor",
  });
}

export function useUpdateSupplier() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: Partial<Supplier> & { id: string }) => {
      const { data, error } = await supabase.from("suppliers").update(updates).eq("id", id).select().single();
      if (error) throw new Error(translateSupplierError(error));
      return data;
    },
    invalidateKeys: [suppliersQueries.keys.all],
    successMsg: "Proveedor actualizado",
    errorTitle: "Error al actualizar proveedor",
  });
}
