import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export {
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useGenerateRecurring,
} from "./useOperatingExpenseMutations";
