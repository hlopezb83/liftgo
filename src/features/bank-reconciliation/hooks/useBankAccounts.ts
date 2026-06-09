import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/appFeedback";

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BankAccountInput) => {
      if (input.id) {
        const { error } = await supabase.from("bank_accounts").update(input).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bank_accounts").insert(input);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BANK_ACCOUNTS_QK });
      toast.success("Cuenta bancaria guardada");
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}

export function useDeleteBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BANK_ACCOUNTS_QK });
      toast.success("Cuenta eliminada");
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}
