import { ReactNode } from "react";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { TablePagination } from "@/components/TablePagination";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableHeader } from "@/components/ui/table";

interface ListPageLayoutProps<T> {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  filters?: ReactNode;
  isLoading: boolean;
  items: T[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  emptyMessage?: string;
  tableHeader: ReactNode;
  renderRow: (item: T, index: number) => ReactNode;
  /** Optional override for the entire content area (e.g. mobile cards) */
  customContent?: ReactNode;
}

export function ListPageLayout<T extends { id?: string }>({
  title,
  subtitle,
  actions,
  filters,
  isLoading,
  items,
  page,
  totalPages,
  onPageChange,
  emptyMessage = "No se encontraron resultados",
  tableHeader,
  renderRow,
  customContent,
}: ListPageLayoutProps<T>) {
  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader title={title} subtitle={subtitle} action={actions} />
        {filters}
        {customContent || (
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <TableSkeleton />
              ) : (
                <Table>
                  <TableHeader>{tableHeader}</TableHeader>
                  <TableBody>
                    {items.length > 0
                      ? items.map((item, i) => renderRow(item, i))
                      : <EmptyRow colSpan={20} message={emptyMessage} />}
                  </TableBody>
                </Table>
              )}
              <TablePagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
            </CardContent>
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
