import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import type { ContractViewModel } from "@/types/rental";
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

type Contract = ContractViewModel;

export const contractKeys = createEntityKeys("contracts");

export function useContracts() {
  return useQuery({
    queryKey: contractKeys.lists(),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, customers(name), forklifts(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((c) => ({
        ...c,
        customer_name: c.customers?.name || null,
        forklift_name: c.forklifts?.name || null,
      }));
    },
  });
}

export function useContract(id: string | undefined) {
  return useQuery({
    queryKey: id ? contractKeys.detail(id) : contractKeys.details(),
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("Contract ID is required");
      const { data, error } = await supabase
        .from("contracts")
        .select("*, customers(name), forklifts(name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return { ...data, customer_name: data.customers?.name || null, forklift_name: data.forklifts?.name || null };
    },
  });
}

type NewContract = Omit<Contract, "id" | "contract_number" | "created_at" | "updated_at" | "customer_name" | "forklift_name">;

export function useCreateContract() {
  return useEntityMutation({
    mutationFn: async (contract: NewContract) => {
      const { data: num, error: numErr } = await supabase.rpc("next_contract_number");
      if (numErr) throw numErr;
      const { data, error } = await supabase
        .from("contracts")
        .insert({ ...contract, contract_number: num as string })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [contractKeys.all],
    errorTitle: "Error al crear contrato",
  });
}

export function useUpdateContract() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"contracts"> & { id: string }) => {
      const { data, error } = await supabase
        .from("contracts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [contractKeys.all],
    errorTitle: "Error al actualizar contrato",
  });
}
