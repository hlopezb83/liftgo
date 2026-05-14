import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import type { ContractViewModel } from "@/types/rental";

type Contract = ContractViewModel;

export function useContracts() {
  return useQuery({
    queryKey: ["contracts"],
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
    queryKey: ["contracts", id],
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

export function useCreateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contract: Omit<Contract, "id" | "contract_number" | "created_at" | "updated_at" | "customer_name" | "forklift_name">) => {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contracts"] }),
  });
}

export function useUpdateContract() {
  const queryClient = useQueryClient();
  return useMutation({
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
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contracts", vars.id] });
    },
  });
}
