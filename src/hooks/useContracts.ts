import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Contract {
  id: string;
  contract_number: string;
  booking_id: string | null;
  customer_id: string | null;
  forklift_id: string | null;
  start_date: string | null;
  end_date: string | null;
  daily_rate: number | null;
  weekly_rate: number | null;
  monthly_rate: number | null;
  deposit_amount: number | null;
  terms_text: string | null;
  status: string;
  signed_at: string | null;
  signed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  customer_name?: string;
  forklift_name?: string;
}

export function useContracts() {
  return useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, customers(name), forklifts(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Record<string, any>[]).map((c) => ({
        ...c,
        customer_name: c.customers?.name || null,
        forklift_name: c.forklifts?.name || null,
      })) as Contract[];
    },
  });
}

export function useContract(id: string | undefined) {
  return useQuery({
    queryKey: ["contracts", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, customers(name), forklifts(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      const c = data as Record<string, unknown>;
      return { ...c, customer_name: (c.customers as any)?.name || null, forklift_name: (c.forklifts as any)?.name || null } as Contract;
    },
  });
}

export function useCreateContract() {
  const qc = useQueryClient();
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts"] }),
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
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
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["contracts", vars.id] });
    },
  });
}
