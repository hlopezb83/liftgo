import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { isValidClabe } from "@/lib/schemas";
import { LIST_PAGE_LIMIT } from "@/lib/supabase/constants";

export interface ExportablePayable {
  id: string;
  bill_number: string;
  supplier_id: string | null;
  supplier_name: string;
  supplier_rfc: string | null;
  due_date: string | null;
  balance: number;
  currency: string;
  /** G-B5: necesario para mostrar el equivalente en MXN del lote de dispersión. */
  exchange_rate: number | null;
  description: string | null;
  payment_in_progress_at: string | null;
  bank_name: string | null;
  clabe: string | null;
  account_number: string | null;
  account_holder: string | null;
  has_valid_clabe: boolean;
}

interface BankAccountRow {
  supplier_id: string;
  bank_name: string;
  clabe: string | null;
  account_number: string | null;
  account_holder: string;
  is_primary: boolean;
  created_at: string;
}

export const exportablePayableQueries = defineEntityQueries<
  "exportable_payables",
  ExportablePayable[],
  never
>("exportable_payables", {
  staleTime: 30_000,
  list: () => async () => {
    const fetchAllBills = async () => {
      const rows: Array<Parameters<typeof toExportable>[0]> = [];
      for (let from = 0; ; from += LIST_PAGE_LIMIT) {
        const { data, error } = await supabase
          .from("supplier_bills")
          .select("id, bill_number, supplier_id, due_date, balance, currency, exchange_rate, description, payment_in_progress_at, suppliers(name, rfc)")
          // R-M4: incluir también facturas que no requieren aprobación explícita.
          .in("approval_status", ["approved", "not_required"])
          // R12-FE-06 (P2 r11): nunca dispersar borradores.
          .neq("status", "draft")
          .gt("balance", 0)
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, from + LIST_PAGE_LIMIT - 1);
        if (error) throw error;
        const page = (data ?? []) as unknown as Array<Parameters<typeof toExportable>[0]>;
        rows.push(...page);
        if (page.length < LIST_PAGE_LIMIT) return rows;
      }
    };

    const fetchAllBanks = async () => {
      const rows: BankAccountRow[] = [];
      for (let from = 0; ; from += LIST_PAGE_LIMIT) {
        const { data, error } = await supabase
          .from("supplier_bank_accounts")
          .select("supplier_id, bank_name, clabe, account_number, account_holder, is_primary, created_at")
          .order("supplier_id", { ascending: true })
          .order("created_at", { ascending: true })
          .range(from, from + LIST_PAGE_LIMIT - 1);
        if (error) throw error;
        const page = (data ?? []) as unknown as BankAccountRow[];
        rows.push(...page);
        if (page.length < LIST_PAGE_LIMIT) return rows;
      }
    };

    const [bills, bankAccounts] = await Promise.all([fetchAllBills(), fetchAllBanks()]);

    const bySupplier = new Map<string, BankAccountRow>();
    for (const b of bankAccounts) {
      const existing = bySupplier.get(b.supplier_id);
      if (!existing) {
        bySupplier.set(b.supplier_id, b);
        continue;
      }
      if (b.is_primary && !existing.is_primary) bySupplier.set(b.supplier_id, b);
    }

    return bills.map((row) => toExportable(row, bySupplier));
  },
});

export function useExportablePayables() {
  return useQuery(exportablePayableQueries.list());
}

interface BankInfo {
  bank_name: string | null;
  clabe: string | null;
  account_number: string | null;
  account_holder: string | null;
  has_valid_clabe: boolean;
}

function resolveBankInfo(bank: BankAccountRow | undefined): BankInfo {
  const clabe = bank?.clabe ?? null;
  const trimmed = clabe?.trim() ?? "";
  return {
    bank_name: bank?.bank_name ?? null,
    clabe,
    account_number: bank?.account_number ?? null,
    account_holder: bank?.account_holder ?? null,
    has_valid_clabe: trimmed.length === 18 && isValidClabe(trimmed),
  };
}

function toExportable(
  row: { id: string; bill_number: string; supplier_id: string | null; due_date: string | null; balance: number; currency: string; exchange_rate: number | null; description: string | null; payment_in_progress_at: string | null; suppliers: { name: string; rfc: string | null } | null },
  bySupplier: Map<string, BankAccountRow>,
): ExportablePayable {
  const sup = row.suppliers;
  const bank = row.supplier_id ? bySupplier.get(row.supplier_id) : undefined;
  return {
    id: row.id,
    bill_number: row.bill_number,
    supplier_id: row.supplier_id,
    supplier_name: sup?.name ?? "—",
    supplier_rfc: sup?.rfc ?? null,
    due_date: row.due_date,
    balance: Number(row.balance),
    currency: row.currency,
    exchange_rate: row.exchange_rate == null ? null : Number(row.exchange_rate),
    description: row.description,
    payment_in_progress_at: row.payment_in_progress_at,
    ...resolveBankInfo(bank),
  };
}
