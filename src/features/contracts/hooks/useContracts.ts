import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { LIST_FETCH_LIMIT } from "@/lib/supabase/constants";
import type { ContractViewModel } from "@/types/rental";
import { contractKeys } from "../lib/queryKeys";

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
    .order("created_at", { ascending: false })
    .limit(LIST_FETCH_LIMIT);
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

export function useContracts() {
  return useQuery(contractQueries.list());
}

export function useContract(id: string | undefined) {
  return useQuery({
    ...contractQueries.detail(id ?? ""),
    enabled: !!id,
  });
}

// R17-C: `status` y `signed_at` los define la DB (default 'draft') o la RPC de
// cambio de estatus. `buildContractPayload` ya no los envía desde el form.
type NewContract = Omit<Contract, "id" | "contract_number" | "created_at" | "updated_at" | "customer_name" | "forklift_name" | "status" | "signed_at">;

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

export type DepositStatus = "held" | "applied" | "returned";

/**
 * A6R2-4: registra el destino del depósito en garantía (retenido/aplicado/
 * devuelto). La validación real (rol, monto ≤ depósito) vive en la RPC
 * `set_contract_deposit_status`.
 */
export function useSetContractDepositStatus() {
  return useEntityMutation({
    mutationFn: async (input: { contractId: string; status: DepositStatus; amount?: number | null; notes?: string | null }) => {
      const { error } = await supabase.rpc("set_contract_deposit_status", {
        p_contract_id: input.contractId,
        p_status: input.status,
        p_amount: input.amount ?? undefined,
        p_notes: input.notes ?? undefined,
      });
      if (error) throw error;
    },
    invalidateKeys: [contractKeys.all],
    successMessage: "Depósito actualizado",
    errorTitle: "Error al actualizar el depósito",
  });
}
