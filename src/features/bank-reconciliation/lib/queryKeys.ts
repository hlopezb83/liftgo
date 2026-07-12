/**
 * Query key factories para la feature `bank-reconciliation`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

export const bankAccountKeys = createEntityKeys("bank_accounts");
export const bankImportKeys = createEntityKeys("bank_statement_imports");
export const bankLineKeys = createEntityKeys("bank_statement_lines");
export const manualMatchCandidateKeys = createEntityKeys("manual_match_candidates");
export const reconciliationStatusKeys = createEntityKeys("reconciliation_status");
