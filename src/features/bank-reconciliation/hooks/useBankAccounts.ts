import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { bankAccountKeys } from "../lib/queryKeys";

export interface BankAccount {
  id: string;
  name: string;
  bank: string;
  last4: string | null;
  currency: string;
  initial_balance: number;
  is_active: boolean;
  notes: string | null;
}

export const bankAccountQueries = defineEntityQueries<"bank_accounts", BankAccount[], never>(
  "bank_accounts",
  {
    staleTime: 60_000,
    list: () => async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, name, bank, last4, currency, initial_balance, is_active, notes")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        initial_balance: Number(r.initial_balance ?? 0),
      }));
    },
  },
);

export function useBankAccounts() {
  return useQuery(bankAccountQueries.list());
}

export interface BankAccountInput {
  id?: string;
  name: string;
  bank: string;
  last4: string | null;
  currency: string;
  initial_balance: number;
  is_active: boolean;
  notes: string | null;
}

export function useUpsertBankAccount() {
  return useEntityMutation({
    mutationFn: async (input: BankAccountInput) => {
      if (input.id) {
        const { error } = await supabase.from("bank_accounts").update(input).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bank_accounts").insert(input);
        if (error) throw error;
      }
    },
    invalidateKeys: [bankAccountKeys.all],
    successMsg: "Cuenta bancaria guardada",
    errorTitle: "Error al guardar cuenta bancaria",
  });
}

export function useDeleteBankAccount() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [bankAccountKeys.all],
    successMsg: "Cuenta eliminada",
    errorTitle: "Error al eliminar cuenta",
  });
}
