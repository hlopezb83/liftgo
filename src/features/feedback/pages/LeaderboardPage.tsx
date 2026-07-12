import { useState } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { TrophyIcon, Medal } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLeaderboard, type LeaderboardPeriod, type LeaderboardRow } from "../hooks/useLeaderboard";

const PODIUM_COLORS = ["text-warning", "text-muted-foreground", "text-[hsl(var(--chart-2))]"];

function PositionCell({ pos }: { pos: number }) {
  if (pos <= 3) {
    const Icon = pos === 1 ? TrophyIcon : Medal;
    return <Icon className={`h-5 w-5 ${PODIUM_COLORS[pos - 1]}`} aria-label={`Posición ${pos}`} />;
  }
  return <span className="text-sm font-medium text-muted-foreground">{pos}</span>;
}

function LeaderboardTable({ period }: { period: LeaderboardPeriod }) {
  const { data, isLoading } = useLeaderboard(period);

  const columns: ColumnDef<LeaderboardRow>[] = [
      {
        id: "position",
        header: "#",
        enableSorting: false,
        meta: { headClassName: "w-16" },
        cell: ({ row, table }) => {
          const sortedRows = table.getSortedRowModel().rows;
          const pos = sortedRows.findIndex((r) => r.id === row.id) + 1;
          return <PositionCell pos={pos} />;
        },
      },
      {
        id: "reporter_name",
        header: "Nombre",
        accessorKey: "reporter_name",
        cell: ({ row }) => <span className="font-medium">{row.original.reporter_name}</span>,
      },
      {
        id: "total_reports",
        header: "Reportes",
        accessorKey: "total_reports",
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.total_reports}</span>,
      },
      {
        id: "accepted_reports",
        header: "Aceptados",
        accessorKey: "accepted_reports",
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.accepted_reports}</span>,
      },
      {
        id: "resolved_reports",
        header: "Resueltos",
        accessorKey: "resolved_reports",
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.resolved_reports}</span>,
      },
      {
        id: "total_points",
        header: "Puntos",
        accessorKey: "total_points",
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="tabular-nums font-semibold">{row.original.total_points}</span>
        ),
      },
    ];

  const table = useLiftgoTable<LeaderboardRow>({
    data,
    columns,
    getRowId: (row) => row.reporter_id,
    initialSorting: [{ id: "total_points", desc: true }],
  });

  return (
    <DataTableV2
      table={table}
      isLoading={isLoading}
      emptyMessage="Aún no hay puntos otorgados en este periodo."
    />
  );
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title="Tabla de honor"
        subtitle="Reconocimiento a quienes ayudan a mejorar LiftGo reportando bugs y proponiendo mejoras."
      />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Top contribuyentes</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as LeaderboardPeriod)}>
            <TabsList>
              <TabsTrigger value="month">Mes</TabsTrigger>
              <TabsTrigger value="year">Año</TabsTrigger>
              <TabsTrigger value="all">Histórico</TabsTrigger>
            </TabsList>
            <TabsContent value="month" className="mt-4"><LeaderboardTable period="month" /></TabsContent>
            <TabsContent value="year" className="mt-4"><LeaderboardTable period="year" /></TabsContent>
            <TabsContent value="all" className="mt-4"><LeaderboardTable period="all" /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
