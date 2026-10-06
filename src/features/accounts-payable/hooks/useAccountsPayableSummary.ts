import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { supplierBillKeys } from "./useSupplierBills";
import type { AccountsPayableKpis } from "./useAccountsPayableKpis";

interface AccountsPayableSummary {
  kpis: AccountsPayableKpis;
  availableMonths: string[];
}

const EMPTY_KPIS: AccountsPayableKpis = {
  totalPendiente: 0,
  totalVencido: 0,
  totalPorVencer: 0,
  pagadoMesActual: 0,
  totalPorAprobar: 0,
  countPorAprobar: 0,
  repPendientes: 0,
  fxMissingCount: 0,
};

function parseSummary(data: Json | null): AccountsPayableSummary {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("El servidor devolvió un resumen de CxP inválido");
  }
  const payload = data as unknown as Partial<AccountsPayableSummary>;
  if (!payload.kpis || !Array.isArray(payload.availableMonths)) {
    throw new Error("El servidor devolvió un resumen de CxP incompleto");
  }
  return {
    kpis: { ...EMPTY_KPIS, ...payload.kpis },
    availableMonths: payload.availableMonths.filter((month): month is string => typeof month === "string"),
  };
}

async function fetchSummary(): Promise<AccountsPayableSummary> {
  const { data, error } = await supabase.rpc("get_accounts_payable_summary");
  if (error) throw error;
  return parseSummary(data);
}

export function useAccountsPayableSummary() {
  const query = useQuery({
    queryKey: [...supplierBillKeys.all, "accounts-payable-summary"],
    queryFn: fetchSummary,
    staleTime: 30_000,
  });

  return {
    ...query,
    kpis: query.data?.kpis ?? EMPTY_KPIS,
    availableMonths: query.data?.availableMonths ?? [],
  };
}
