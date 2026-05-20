import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ExpenseInput } from "./types";

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (expense: ExpenseInput) => {
      const { error } = await supabase.from("operating_expenses").insert(expense);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operating_expenses"] });
      toast.success("Gasto registrado");
    },
    onError: () => toast.error("Error al registrar gasto"),
  });
}
