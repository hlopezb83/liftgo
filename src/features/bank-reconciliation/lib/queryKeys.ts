/**
 * Query key factories para la feature `bank-reconciliation`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

export const bankAccountKeys = createEntityKeys("bank_accounts");
export const bankImportKeys = createEntityKeys("bank_statement_imports");
export const bankLineKeys = createEntityKeys("bank_statement_lines");

const bankMatchCandidateBase = createEntityKeys("bank_match_candidates");

export const bankMatchCandidateKeys = {
  ...bankMatchCandidateBase,
  search: (lineId: string | null, normalizedSearch: string, dateWindow: number) =>
    [...bankMatchCandidateBase.all, lineId, normalizedSearch, dateWindow] as const,
} as const;
