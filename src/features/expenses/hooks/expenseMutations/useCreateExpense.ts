import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatCurrency";
import { parseDateLocal } from "@/lib/utils";
import {
  EXPENSE_CATEGORY_LABELS,
  type OperatingExpense,
} from "../useOperatingExpenses";
import type { ExpenseInput } from "./types";

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (expense: ExpenseInput): Promise<OperatingExpense> => {
      const { data, error } = await supabase
        .from("operating_expenses")
        .insert(expense)
        .select("*, suppliers(name)")
        .single();
      if (error) throw error;
      return data as unknown as OperatingExpense;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["operating_expenses"] });
      const fecha = format(parseDateLocal(created.expense_date), "dd/MM/yyyy", { locale: es });
      toast.success("Gasto registrado", {
        description: `${EXPENSE_CATEGORY_LABELS[created.category]} · ${formatCurrency(created.amount)} · ${fecha}`,
        duration: 6000,
      });
    },
    onError: () => notifyError({ message: "Error al registrar gasto" }),
  });
}
