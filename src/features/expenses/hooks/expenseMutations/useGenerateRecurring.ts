import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildRecurringInserts } from "@/features/expenses/lib/recurringExpensesHelpers";

export function useGenerateRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const toInsert = await buildRecurringInserts();
      if (toInsert === null) {
        toast.info("No hay gastos recurrentes configurados");
        return 0;
      }
      if (toInsert.length === 0) {
        toast.info("Todos los gastos recurrentes ya existen este mes");
        return 0;
      }
      const { error: insErr } = await supabase.from("operating_expenses").insert(toInsert);
      if (insErr) throw insErr;
      return toInsert.length;
    },
    onSuccess: (count) => {
      if (count && count > 0) {
        queryClient.invalidateQueries({ queryKey: ["operating_expenses"] });
        toast.success(`${count} gasto(s) recurrente(s) generado(s)`);
      }
    },
    onError: () => notifyError({ message: "Error al generar gastos recurrentes" }),
  });
}
