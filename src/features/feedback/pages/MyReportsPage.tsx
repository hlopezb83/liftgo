import { useState } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { TablePagination } from "@/components/feedback/TablePagination";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateMty } from "@/lib/format/dateFormats";
import { FeedbackStatusBadge } from "../components/FeedbackStatusBadge";
import {
  useMyFeedbackPointsTotal,
  useMyFeedbackReports,
  type FeedbackReport,
} from "../hooks/useFeedbackReports";
import { FEEDBACK_TYPE_LABELS } from "../lib/constants";

type Report = FeedbackReport;

const PAGE_SIZE = 25;

export default function MyReportsPage() {
  const [page, setPage] = useState(1);
  const { data: result, isLoading, isError, refetch } = useMyFeedbackReports(page, PAGE_SIZE);
  const pointsQuery = useMyFeedbackPointsTotal();
  const reports = result?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil((result?.totalCount ?? 0) / PAGE_SIZE));
  const pointsLabel = pointsQuery.isLoading
    ? "Cargando puntos…"
    : pointsQuery.isError
      ? "Puntos no disponibles"
      : `${pointsQuery.data ?? 0} puntos`;

  const columns: ColumnDef<Report>[] = [
    {
      id: "folio",
      header: "Folio",
      accessorKey: "folio",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.folio}</span>,
    },
    {
      id: "type",
      header: "Tipo",
      accessorKey: "type",
      cell: ({ row }) => FEEDBACK_TYPE_LABELS[row.original.type as "bug" | "improvement"] ?? row.original.type,
    },
    {
      id: "module",
      header: "Módulo",
      accessorKey: "module",
      cell: ({ row }) => <span className="text-sm">{row.original.module}</span>,
    },
    {
      id: "title",
      header: "Título",
      accessorKey: "title",
      meta: { cellClassName: "max-w-[280px] truncate" },
    },
    {
      id: "status",
      header: "Estado",
      accessorKey: "status",
      cell: ({ row }) => <FeedbackStatusBadge status={row.original.status} />,
    },
    {
      id: "points_awarded",
      header: "Puntos",
      accessorKey: "points_awarded",
      meta: { kind: "number" },
      cell: ({ row }) => <span className="font-medium">{row.original.points_awarded}</span>,
    },
    {
      id: "created_at",
      header: "Fecha",
      accessorKey: "created_at",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateMty(row.original.created_at)}</span>,
    },
  ];

  const table = useLiftgoTable<Report>({
    data: reports,
    columns,
    getRowId: (r) => r.id,
    initialSorting: [{ id: "created_at", desc: true }],
    paginated: false,
  });

  return (
    <PageContainer>
      <PageHeader
        title="Mis reportes"
        subtitle="Tus bugs reportados y mejoras propuestas."
        actions={
          <Badge variant="secondary" className="text-base px-3 py-1.5">
            {pointsLabel}
          </Badge>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{result?.totalCount ?? 0} reportes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <QueryErrorState entity="tus reportes" onRetry={() => { void refetch(); }} bare />
          ) : (
            <DataTableV2
              table={table}
              isLoading={isLoading}
              emptyMessage="Sin reportes todavía. Usa el botón “Reportar” para enviar el primero."
            />
          )}
          {!isError && reports.length > 0 && (
            <div className="border-t p-3">
              <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
