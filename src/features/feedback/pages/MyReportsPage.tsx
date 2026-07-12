
import { DataTableV2, DataTablePaginationV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateMty } from "@/lib/format/dateFormats";
import { FeedbackStatusBadge } from "../components/FeedbackStatusBadge";
import { useMyFeedbackReports } from "../hooks/useFeedbackReports";
import { FEEDBACK_TYPE_LABELS } from "../lib/constants";

type Report = NonNullable<ReturnType<typeof useMyFeedbackReports>["data"]>[number];

export default function MyReportsPage() {
  const { data: reports, isLoading } = useMyFeedbackReports();

  const totalPoints = (reports ?? []).reduce((sum, r) => sum + (r.points_awarded ?? 0), 0);

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
      meta: { align: "right" },
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
    data: reports ?? [],
    columns,
    getRowId: (r) => r.id,
    initialSorting: [{ id: "created_at", desc: true }],
  });

  return (
    <PageContainer>
      <PageHeader
        title="Mis reportes"
        subtitle="Tus bugs reportados y mejoras propuestas."
        actions={
          <Badge variant="secondary" className="text-base px-3 py-1.5">
            {totalPoints} puntos
          </Badge>
        }
      />


      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{reports?.length ?? 0} reportes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTableV2
            table={table}
            isLoading={isLoading}
            emptyMessage="Sin reportes todavía. Usa el botón “Reportar” para enviar el primero."
          />
          {(reports?.length ?? 0) > 0 && (
            <div className="border-t p-3">
              <DataTablePaginationV2 table={table} />
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
