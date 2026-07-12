
import { useQuoteAssignments } from "@/features/fleet";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { getSaleLines } from "../../utils/saleLines";

export interface SaleAssignmentStatus {
  hasSaleLines: boolean;
  totalRequired: number;
  totalAssigned: number;
  isComplete: boolean;
  missingByLine: Array<{ index: number; description: string; assigned: number; required: number }>;
}

export function useQuoteSaleAssignmentStatus(
  quoteId: string | undefined,
  lineItems: LineItem[],
): SaleAssignmentStatus {
  const { data: assignments } = useQuoteAssignments(quoteId);

  return (() => {
    const saleLines = getSaleLines(lineItems);
    if (saleLines.length === 0) {
      const empty: SaleAssignmentStatus["missingByLine"] = [];
      return { hasSaleLines: false, totalRequired: 0, totalAssigned: 0, isComplete: true, missingByLine: empty };
    }

    const missingByLine: SaleAssignmentStatus["missingByLine"] = [];
    let totalRequired = 0;
    let totalAssigned = 0;

    for (const { index, item } of saleLines) {
      const required = item.quantity || 1;
      const assigned = (assignments || []).filter((a) => a.line_index === index).length;
      totalRequired += required;
      totalAssigned += assigned;
      if (assigned < required) {
        missingByLine.push({ index, description: item.description, assigned, required });
      }
    }

    return {
      hasSaleLines: true,
      totalRequired,
      totalAssigned,
      isComplete: missingByLine.length === 0,
      missingByLine,
    };
  })();
}
