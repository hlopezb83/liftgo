import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { toast } from "sonner";
import type { ExpenseUpdate } from "./types";

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: ExpenseUpdate) => {
      const { data, error } = await supabase
        .from("operating_expenses")
        .update(updates)
        .eq("id", id)
        .select("id");
      if (error) throw error;
      assertRowsAffected(data, "Actualizar gasto");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operating_expenses"] });
      toast.success("Gasto actualizado");
    },
    onError: () => notifyError({ message: "Error al actualizar gasto" }),
  });
}
