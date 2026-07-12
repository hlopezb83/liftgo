import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import type { ContractViewModel } from "@/types/rental";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

type Contract = ContractViewModel;

type ContractRelations = { customers?: { name?: string } | null; forklifts?: { name?: string } | null };

function mapRow<T extends ContractRelations>(row: T): T & { customer_name?: string; forklift_name?: string } {
  return {
    ...row,
    customer_name: row.customers?.name ?? undefined,
    forklift_name: row.forklifts?.name ?? undefined,
  };
}

async function fetchList() {
  const { data, error } = await supabase
    .from("contracts")
    .select("*, customers(name), forklifts(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

async function fetchDetail(id: string) {
  const { data, error } = await supabase
    .from("contracts")
    .select("*, customers(name), forklifts(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return mapRow(data);
}

export const contractQueries = defineEntityQueries(
  "contracts",
  {
    list: () => fetchList,
    detail: (id: string) => () => fetchDetail(id),
  },
);

export const contractKeys = contractQueries.keys;

export function useContracts() {
  return useQuery(contractQueries.list());
}

export function useContract(id: string | undefined) {
  return useQuery({
    ...contractQueries.detail(id ?? ""),
    enabled: !!id,
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
