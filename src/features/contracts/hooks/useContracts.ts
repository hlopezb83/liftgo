import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import type { ContractViewModel } from "@/types/rental";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

type Contract = ContractViewModel;
type ContractListRow = Contract;
type ContractRow = Contract;

async function mapListRow(rows: unknown[]): Promise<ContractListRow[]> {
  return (rows as Array<Record<string, unknown> & { customers?: { name?: string } | null; forklifts?: { name?: string } | null }>).map((c) => ({
    ...(c as unknown as ContractListRow),
    customer_name: c.customers?.name ?? null,
    forklift_name: c.forklifts?.name ?? null,
  }));
}

export const contractQueries = defineEntityQueries<"contracts", ContractListRow[], ContractRow>(
  "contracts",
  {
    list: () => async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, customers(name), forklifts(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return mapListRow(data ?? []);
    },
    detail: (id: string) => async () => {
      if (!id) throw new Error("Contract ID is required");
      const { data, error } = await supabase
        .from("contracts")
        .select("*, customers(name), forklifts(name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return {
        ...(data as unknown as ContractRow),
        customer_name: data.customers?.name ?? null,
        forklift_name: data.forklifts?.name ?? null,
      };
    },
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
