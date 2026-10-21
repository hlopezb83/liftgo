import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { useHasFinancialAccess, useHasModuleAccess } from "@/features/users";
import {
  canOpenStatementDocuments,
  documentKind,
  type StatementDocumentScope,
  type StatementDocumentSelection,
} from "../../hooks/incomeStatement/documentDrilldown";
import { ComparisonTable } from "./incomeStatement/ComparisonTable";
import { IncomeStatementDocuments } from "./incomeStatement/IncomeStatementDocuments";
import {
  getBreakdownFor,
  type BreakdownRow,
} from "./incomeStatement/incomeStatementHelpers";
import { StatementTableRow } from "./incomeStatement/StatementTableRow";
import type {
  StatementRow,
  ComparisonRow,
} from "../../hooks/useIncomeStatementData";

interface MonthData {
  month: string;
  monthKey: string;
}
interface YearTotal {
  year: string;
}

interface Props {
  documentScope?: StatementDocumentScope;
  documentsEnabled?: boolean;
  isComparison: boolean;
  filteredData: MonthData[];
  yearTotals: YearTotal[];
  comparisonRows: ComparisonRow[];
  statementRows: StatementRow[];
  depreciationBreakdownRows: BreakdownRow[];
  cogsBreakdownRows: BreakdownRow[];
  rentalBookedBreakdownRows: BreakdownRow[];
  rentalUnbookedBreakdownRows: BreakdownRow[];
  salesBreakdownRows: BreakdownRow[];
  otherServicesBreakdownRows: BreakdownRow[];
  damageRecoveryBreakdownRows: BreakdownRow[];
  creditNotesBreakdownRows: BreakdownRow[];
  expenseDetailBreakdownByCategory: Record<string, BreakdownRow[]>;
}

function StatementHeader({ months }: { months: MonthData[] }) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">
          Concepto
        </TableHead>
        {months.map((d) => (
          <TableHead key={d.month} className="text-right min-w-[110px]">
            {d.month}
          </TableHead>
        ))}
        <TableHead className="text-right min-w-[120px] font-bold">
          Total
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

function restoreDocumentFocus(
  opener: HTMLElement | null,
  fallback: HTMLElement | null,
) {
  const target =
    opener?.isConnected && opener !== document.body ? opener : fallback;
  target?.focus();
}

export function IncomeStatementTable({
  documentScope,
  documentsEnabled = false,
  isComparison,
  filteredData,
  yearTotals,
  comparisonRows,
  statementRows,
  depreciationBreakdownRows,
  cogsBreakdownRows,
  rentalBookedBreakdownRows,
  rentalUnbookedBreakdownRows,
  salesBreakdownRows,
  otherServicesBreakdownRows,
  damageRecoveryBreakdownRows,
  creditNotesBreakdownRows,
  expenseDetailBreakdownByCategory,
}: Props) {
  const openerRef = useRef<HTMLElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const organizationId = useVerifiedOrganizationId();
  const permissions = {
    financial: useHasFinancialAccess(),
    reports: useHasModuleAccess("Reportes"),
    invoices: useHasModuleAccess("Facturas"),
    payments: useHasModuleAccess("Pagos"),
    supplierBills: useHasModuleAccess("Facturas de Proveedor"),
    expenses: useHasModuleAccess("Gastos"),
  };
  const [selection, setSelection] = useState<
    (StatementDocumentSelection & { organizationId: string }) | null
  >(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (isComparison && comparisonRows.length > 0) {
    return <ComparisonTable comparisonRows={comparisonRows} yearTotals={yearTotals} />;
  }
  if (isComparison) return null;

  return (
    <>
      <div
        ref={tableRef}
        tabIndex={-1}
        role="region"
        aria-label="Estado de resultados y documentos"
      >
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <StatementHeader months={filteredData} />
              <TableBody>
                {statementRows.map((row) => {
                  const breakdown = getBreakdownFor(
                    row.label,
                    depreciationBreakdownRows,
                    cogsBreakdownRows,
                    rentalBookedBreakdownRows,
                    rentalUnbookedBreakdownRows,
                    salesBreakdownRows,
                    damageRecoveryBreakdownRows,
                    expenseDetailBreakdownByCategory,
                    otherServicesBreakdownRows,
                    creditNotesBreakdownRows,
                  );
                  const kind = documentKind(breakdown?.key);
                  const canDrill =
                    documentsEnabled &&
                    organizationId &&
                    documentScope &&
                    kind &&
                    canOpenStatementDocuments(
                      kind,
                      documentScope.accountingBasis,
                      permissions,
                    );
                  const showDocuments = canDrill
                    ? (
                        label: string | null,
                        amount: number,
                        monthIndex?: number,
                      ) => {
                        if (!kind || !organizationId) return;
                        openerRef.current =
                          document.activeElement instanceof HTMLElement
                            ? document.activeElement
                            : null;
                        const months =
                          monthIndex === undefined
                            ? filteredData.map((m) => m.monthKey)
                            : [filteredData[monthIndex].monthKey];
                        setSelection({
                          kind,
                          organizationId,
                          label: label?.slice(6) ?? null,
                          title: label?.trimStart() ?? row.label.trim(),
                          months,
                          expectedTotal: amount,
                        });
                      }
                    : undefined;
                  const isExpandable = breakdown !== null;
                  const isOpen = isExpandable && !!open[breakdown.key];
                  const toggle = () =>
                    breakdown &&
                    setOpen((prev) => ({
                      ...prev,
                      [breakdown.key]: !prev[breakdown.key],
                    }));

                  return (
                    <StatementTableRow
                      key={row.label}
                      row={row}
                      onOpenDocuments={showDocuments}
                      breakdownRows={breakdown?.rows ?? []}
                      isExpandable={isExpandable}
                      isOpen={isOpen}
                      toggle={toggle}
                      filteredCols={filteredData.length}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      {selection &&
        selection.organizationId === organizationId &&
        documentScope &&
        documentsEnabled &&
        canOpenStatementDocuments(
          selection.kind,
          documentScope.accountingBasis,
          permissions,
        ) && (
          <IncomeStatementDocuments
            key={JSON.stringify(selection)}
            scope={documentScope}
            selection={selection}
            onClose={() => setSelection(null)}
            returnFocus={() =>
              restoreDocumentFocus(openerRef.current, tableRef.current)
            }
          />
        )}
    </>
  );
}
