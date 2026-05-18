import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { startOfMonth, format } from "date-fns";
import { nowMty } from "@/lib/utils";
import type { ExpenseCategory } from "./useOperatingExpenses";

type ExpenseInput = {
  category: ExpenseCategory;
  description?: string;
  amount: number;
  expense_date: string;
  is_recurring?: boolean;
  supplier_id?: string | null;
};

type ExpenseUpdate = { id: string } & Partial<ExpenseInput>;

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

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("operating_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operating_expenses"] });
      toast.success("Gasto eliminado");
    },
    onError: () => toast.error("Error al eliminar gasto"),
  });
}

async function buildRecurringInserts() {
  const { data: recurring, error: fetchErr } = await supabase
    .from("operating_expenses").select("*").eq("is_recurring", true);
  if (fetchErr) throw fetchErr;
  if (!recurring || recurring.length === 0) return null;

  const monthStart = format(startOfMonth(nowMty()), "yyyy-MM-dd");
  const monthKey = format(nowMty(), "yyyy-MM");

  const { data: existing, error: existErr } = await supabase
    .from("operating_expenses").select("category, description")
    .gte("expense_date", monthStart).lt("expense_date", `${monthKey}-32`);
  if (existErr) throw existErr;

  const existingSet = new Set((existing || []).map((e) => `${e.category}::${e.description || ""}`));

  return recurring
    .filter((r) => !existingSet.has(`${r.category}::${r.description || ""}`))
    .map((r) => ({
      category: r.category,
      description: r.description,
      amount: r.amount,
      expense_date: monthStart,
      is_recurring: true,
    }));
}

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
    onError: () => toast.error("Error al generar gastos recurrentes"),
  });
}
