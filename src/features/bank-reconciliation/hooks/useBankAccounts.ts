import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";


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

export const BANK_ACCOUNTS_QK = ["bank_accounts"] as const;

export function useBankAccounts() {
  return useQuery({
    queryKey: BANK_ACCOUNTS_QK,
    staleTime: 60_000,
    queryFn: async (): Promise<BankAccount[]> => {
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
  });
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
    invalidateKeys: [BANK_ACCOUNTS_QK],
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
    invalidateKeys: [BANK_ACCOUNTS_QK],
    successMsg: "Cuenta eliminada",
    errorTitle: "Error al eliminar cuenta",
  });
}

