import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExportablePayable {
  id: string;
  bill_number: string;
  supplier_id: string | null;
  supplier_name: string;
  supplier_rfc: string | null;
  due_date: string | null;
  balance: number;
  currency: string;
  description: string | null;
  payment_in_progress_at: string | null;
  bank_name: string | null;
  clabe: string | null;
  account_number: string | null;
  account_holder: string | null;
  has_valid_clabe: boolean;
}

export const EXPORTABLE_PAYABLES_QK = ["exportable_payables"] as const;

interface BankAccountRow {
  supplier_id: string;
  bank_name: string;
  clabe: string | null;
  account_number: string | null;
  account_holder: string;
  is_primary: boolean;
  created_at: string;
}

export function useExportablePayables() {
  return useQuery({
    queryKey: EXPORTABLE_PAYABLES_QK,
    staleTime: 30_000,
    queryFn: async (): Promise<ExportablePayable[]> => {
      const [billsRes, banksRes] = await Promise.all([
        supabase
          .from("supplier_bills")
          .select("id, bill_number, supplier_id, due_date, balance, currency, description, payment_in_progress_at, suppliers(name, rfc)")
          .eq("approval_status", "approved")
          .gt("balance", 0)
          .order("due_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("supplier_bank_accounts")
          .select("supplier_id, bank_name, clabe, account_number, account_holder, is_primary, created_at"),
      ]);
      if (billsRes.error) throw billsRes.error;
      if (banksRes.error) throw banksRes.error;

      const bySupplier = new Map<string, BankAccountRow>();
      for (const b of (banksRes.data ?? []) as BankAccountRow[]) {
        const existing = bySupplier.get(b.supplier_id);
        if (!existing) {
          bySupplier.set(b.supplier_id, b);
          continue;
        }
        if (b.is_primary && !existing.is_primary) bySupplier.set(b.supplier_id, b);
      }

      return (billsRes.data ?? []).map((row) => toExportable(row, bySupplier));
    },
  });
}

function toExportable(
  row: { id: string; bill_number: string; supplier_id: string | null; due_date: string | null; balance: number; currency: string; description: string | null; payment_in_progress_at: string | null; suppliers: { name: string; rfc: string | null } | null },
  bySupplier: Map<string, BankAccountRow>,
): ExportablePayable {
  const sup = row.suppliers;
  const bank = row.supplier_id ? bySupplier.get(row.supplier_id) : undefined;
  const clabe = bank?.clabe ?? null;
  const hasValid = !!clabe && clabe.trim().length === 18 && /^\d{18}$/.test(clabe.trim());
  return {
    id: row.id,
    bill_number: row.bill_number,
    supplier_id: row.supplier_id,
    supplier_name: sup?.name ?? "—",
    supplier_rfc: sup?.rfc ?? null,
    due_date: row.due_date,
    balance: Number(row.balance),
    currency: row.currency,
    description: row.description,
    payment_in_progress_at: row.payment_in_progress_at,
    bank_name: bank?.bank_name ?? null,
    clabe,
    account_number: bank?.account_number ?? null,
    account_holder: bank?.account_holder ?? null,
    has_valid_clabe: hasValid,
  };
}
