import { useQuery } from "@tanstack/react-query";
import { callAccountsPayableBillPageRpc, parseAccountsPayableBillPage } from "../lib/accountsPayableRpc";
import { supplierBillKeys } from "./useSupplierBills";

export type { AccountsPayableBillPage } from "../lib/accountsPayableRpc";

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
      const { data, error } = await callAccountsPayableBillPageRpc({
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
      return parseAccountsPayableBillPage(data, pageIndex, pageSize);
    },
    enabled,
    staleTime: 30_000,
  });

  return query;
}
