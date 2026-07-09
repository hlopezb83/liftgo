/**
 * Query key factories para la feature `suppliers`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

export const supplierKeys = createEntityKeys("suppliers");
export const supplierContactKeys = createEntityKeys("supplier_contacts");
export const supplierBankAccountKeys = createEntityKeys("supplier_bank_accounts");
