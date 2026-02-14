import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Quote = {
  id: string;
  quote_number: string;
  customer_id: string | null;
  customer_name: string | null;
  forklift_id: string | null;
  start_date: string;
  end_date: string;
  line_items: any;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: string;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function useQuotes() {
  return useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Quote[];
    },
  });
}

export function useQuote(id?: string) {
  return useQuery({
    queryKey: ["quotes", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Quote;
    },
  });
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (quote: Omit<Quote, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("quotes").insert(quote as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useUpdateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from("quotes").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useNextQuoteNumber() {
  return useQuery({
    queryKey: ["next_quote_number"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("next_quote_number");
      if (error) throw error;
      return data as string;
    },
  });
}
