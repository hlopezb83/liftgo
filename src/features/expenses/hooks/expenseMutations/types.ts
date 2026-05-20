import type { ExpenseCategory } from "../useOperatingExpenses";

export type ExpenseInput = {
  category: ExpenseCategory;
  description?: string;
  amount: number;
  expense_date: string;
  is_recurring?: boolean;
  supplier_id?: string | null;
};

export type ExpenseUpdate = { id: string } & Partial<ExpenseInput>;
