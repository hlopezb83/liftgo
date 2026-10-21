import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
import type {
  StatementDocumentPage,
  StatementDocumentScope,
  StatementDocumentSelection,
} from "./documentDrilldown";

export const STATEMENT_DOCUMENT_PAGE_SIZE = 25;
export const statementDocumentQueries = defineEntityQueries(
  "income_statement_documents",
  {
    list:
      (filter) =>
      async ({ signal }): Promise<StatementDocumentPage> =>
        callRpc(
          "get_income_statement_documents",
          {
            p_start_date: filter?.startDate,
            p_end_date: filter?.endDate,
            p_basis: filter?.accountingBasis,
            p_kind: filter?.kind,
            p_label: filter?.label,
            p_month_keys: filter?.months,
            p_limit: STATEMENT_DOCUMENT_PAGE_SIZE,
            p_offset: Number(filter?.page ?? 0) * STATEMENT_DOCUMENT_PAGE_SIZE,
          },
          { signal },
        ),
    staleTime: 0,
  },
);

export function useIncomeStatementDocuments(
  scope: StatementDocumentScope,
  selection: StatementDocumentSelection,
  page: number,
) {
  const organizationId = useVerifiedOrganizationId();
  const { user } = useAuth();
  return useQuery({
    ...statementDocumentQueries.list({
      ...scope,
      kind: selection.kind,
      label: selection.label,
      months: selection.months,
      page,
      organizationId,
      userId: user?.id,
    }),
    enabled: !!organizationId && !!user?.id,
    retry: false,
  });
}
