import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { startOfMonth, format } from "date-fns";
import { nowMty } from "@/lib/utils";

export type ExpenseCategory = "renta" | "nomina" | "software" | "depreciacion" | "otro" | "costo_venta" | "caja_chica" | "publicidad";

export interface OperatingExpense {
  id: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  expense_date: string;
  is_recurring: boolean;
  supplier_id: string | null;
  suppliers: { name: string } | null;
  created_at: string;
  updated_at: string;
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  renta: "Renta",
  nomina: "Nómina",
  software: "Software",
  depreciacion: "Depreciación",
  costo_venta: "Costo de Venta",
  caja_chica: "Caja Chica",
  publicidad: "Publicidad",
  otro: "Otro",
};

export function useOperatingExpenses() {
  return useQuery({
    queryKey: ["operating_expenses"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operating_expenses")
        .select("*, suppliers(name)")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data as OperatingExpense[];
    },
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (expense: { category: ExpenseCategory; description?: string; amount: number; expense_date: string; is_recurring?: boolean; supplier_id?: string | null }) => {
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
    mutationFn: async ({ id, ...updates }: { id: string; category?: ExpenseCategory; description?: string; amount?: number; expense_date?: string; is_recurring?: boolean }) => {
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

export function useGenerateRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: recurring, error: fetchErr } = await supabase
        .from("operating_expenses")
        .select("*")
        .eq("is_recurring", true);
      if (fetchErr) throw fetchErr;
      if (!recurring || recurring.length === 0) {
        toast.info("No hay gastos recurrentes configurados");
        return 0;
      }

      const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
      const monthKey = format(new Date(), "yyyy-MM");

      const { data: existing, error: existErr } = await supabase
        .from("operating_expenses")
        .select("category, description")
        .gte("expense_date", monthStart)
        .lt("expense_date", `${monthKey}-32`);
      if (existErr) throw existErr;

      const existingSet = new Set(
        (existing || []).map((e) => `${e.category}::${e.description || ""}`)
      );

      const toInsert = recurring
        .filter((r) => !existingSet.has(`${r.category}::${r.description || ""}`))
        .map((r) => ({
          category: r.category,
          description: r.description,
          amount: r.amount,
          expense_date: monthStart,
          is_recurring: true,
        }));

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
