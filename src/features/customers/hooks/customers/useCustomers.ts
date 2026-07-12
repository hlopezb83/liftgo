import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { customerKeys } from "../../lib/queryKeys";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Customer = Tables<"customers">;

export const customerQueries = defineEntityQueries<"customers", Customer[], never>("customers", {
  list: () => async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .is("deleted_at", null)
      .or("is_e2e.is.null,is_e2e.eq.false")
      .not("name", "ilike", "E2E%")
      .or("email.is.null,email.neq.e2e-ui@test.local")
      .order("name");
    if (error) throw error;
    return data;
  },
});

export function useCustomers() {
  return useQuery(customerQueries.list());
}

export function useCreateCustomer() {
  return useEntityMutation({
    mutationFn: async (customer: TablesInsert<"customers">) => {
      const { data, error } = await supabase.from("customers").insert(customer).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [customerKeys.all],
    errorTitle: "Error al crear cliente",
  });
}

export function useUpdateCustomer() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"customers"> & { id: string }) => {
      const { data, error } = await supabase.from("customers").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [customerKeys.all],
    errorTitle: "Error al actualizar cliente",
  });
}

export function useDeleteCustomer() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      // Soft delete: preserva historial de facturas y bookings
      const { error } = await supabase.rpc("soft_delete_customer", { p_customer_id: id });
      if (error) throw error;
    },
    invalidateKeys: [customerKeys.all],
    errorTitle: "Error al archivar cliente",
  });
}
