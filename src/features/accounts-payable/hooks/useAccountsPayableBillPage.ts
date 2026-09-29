import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { supplierBillKeys, type SupplierBillListItem } from "./useSupplierBills";

export interface AccountsPayableBillPageRequest {
  search: string;
  status: string;
  supplierId: string;
  category: string;
  month: string;
  approval: string;
  rep: string;
  pageIndex: number;
  pageSize: number;
  sortBy: string;
  sortDesc: boolean;
  enabled?: boolean;
}

export interface AccountsPayableBillPage {
  items: SupplierBillListItem[];
  totalCount: number;
}

const EMPTY_REP_SUMMARY: SupplierBillListItem["rep_summary"] = {
  pending: 0,
  received: 0,
  rejected: 0,
  total: 0,
  worst: "not_required",
};

function parsePage(data: Json | null): AccountsPayableBillPage {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("El servidor devolvió una página de CxP inválida");
  }
  const payload = data as unknown as Partial<AccountsPayableBillPage>;
  if (!Array.isArray(payload.items) || typeof payload.totalCount !== "number") {
    throw new Error("El servidor devolvió una página de CxP incompleta");
  }
  return {
    items: (payload.items as SupplierBillListItem[]).map((item) => ({
      ...item,
      rep_summary: EMPTY_REP_SUMMARY,
      payments: [],
    })),
    totalCount: payload.totalCount,
  };
}

export function useAccountsPayableBillPage(request: AccountsPayableBillPageRequest) {
  const {
    search, status, supplierId, category, month, approval, rep,
    pageIndex, pageSize, sortBy, sortDesc, enabled = true,
  } = request;
  const query = useQuery({
    queryKey: [...supplierBillKeys.all, "accounts-payable-page", {
      search, status, supplierId, category, month, approval, rep,
      pageIndex, pageSize, sortBy, sortDesc,
    }],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_supplier_bills_page", {
        p_search: search.trim() || null,
        p_status: status,
        p_supplier_id: supplierId === "all" ? null : supplierId,
        p_category: category,
        p_month: month === "all" ? null : month,
        p_approval: approval,
        p_rep: rep,
        p_page: pageIndex,
        p_page_size: pageSize,
        p_sort_by: sortBy,
        p_sort_desc: sortDesc,
      });
      if (error) throw error;
      return parsePage(data);
    },
    enabled,
    staleTime: 30_000,
  });

  return query;
}
