/**
 * Query key factories para la feature `accounts-payable`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

export const billApprovalKeys = createEntityKeys("supplier_bill_approvals");
export const exportablePayableKeys = createEntityKeys("exportable_payables");
