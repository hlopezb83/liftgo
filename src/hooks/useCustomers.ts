import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Customer = Tables<"customers">;

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (customer: TablesInsert<"customers">) => {
      const { data, error } = await supabase.from("customers").insert(customer).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
    onError: (err: Error) => {
      import("sonner").then(({ toast }) =>
        toast.error("Error al crear cliente", { description: err.message })
      );
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"customers"> & { id: string }) => {
      const { data, error } = await supabase.from("customers").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
    onError: (err: Error) => {
      import("sonner").then(({ toast }) =>
        toast.error("Error al actualizar cliente", { description: err.message })
      );
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
    onError: (err: Error) => {
      import("sonner").then(({ toast }) =>
        toast.error("Error al eliminar cliente", { description: err.message })
      );
    },
  });
}
