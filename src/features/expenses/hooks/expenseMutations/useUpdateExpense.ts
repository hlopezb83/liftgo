import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ExpenseUpdate } from "./types";

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: ExpenseUpdate) => {
      const { error } = await supabase.from("operating_expenses").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operating_expenses"] });
      toast.success("Gasto actualizado");
    },
    onError: () => toast.error("Error al actualizar gasto"),
  });
}
