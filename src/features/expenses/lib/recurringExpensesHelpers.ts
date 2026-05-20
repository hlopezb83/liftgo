import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, format } from "date-fns";
import { nowMty } from "@/lib/utils";

export async function buildRecurringInserts() {
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
