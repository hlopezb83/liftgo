import { ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { EmptyState } from "@/components/EmptyState";
import { TablePagination } from "@/components/TablePagination";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableHeader } from "@/components/ui/table";

interface ListPageLayoutProps<T> {
  title: string;
  subtitle?: string;
  totalCount?: number;
  actions?: ReactNode;
  filters?: ReactNode;
  isLoading: boolean;
  items: T[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  tableHeader: ReactNode;
  renderRow: (item: T, index: number) => ReactNode;
  customContent?: ReactNode;
  skeletonColumns?: number;
}

export function ListPageLayout<T extends { id?: string }>({
  title,
  subtitle,
  totalCount,
  actions,
  filters,
  isLoading,
  items,
  page,
  totalPages,
  onPageChange,
  emptyMessage = "No se encontraron resultados",
  emptyIcon,
  emptyActionLabel,
  onEmptyAction,
  tableHeader,
  renderRow,
  customContent,
}: ListPageLayoutProps<T>) {
  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader title={title} subtitle={totalCount !== undefined ? `${subtitle || ""}${subtitle ? " — " : ""}${totalCount} resultado${totalCount !== 1 ? "s" : ""}` : subtitle} action={actions} />
        {filters}
        {customContent || (
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <TableSkeleton />
              ) : items.length === 0 ? (
                <EmptyState
                  icon={emptyIcon}
                  title={emptyMessage}
                  subtitle="Aún no se han registrado registros aquí."
                  actionLabel={emptyActionLabel}
                  onAction={onEmptyAction}
                />
              ) : (
                <Table>
                  <TableHeader>{tableHeader}</TableHeader>
                  <TableBody>
                    {items.map((item, i) => renderRow(item, i))}
                  </TableBody>
                </Table>
              )}
              {items.length > 0 && <TablePagination page={page} totalPages={totalPages} onPageChange={onPageChange} />}
            </CardContent>
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
