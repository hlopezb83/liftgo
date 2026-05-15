import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Medal } from "lucide-react";
import { useLeaderboard, type LeaderboardPeriod } from "@/features/feedback/hooks/useLeaderboard";

const PODIUM_COLORS = ["text-amber-500", "text-slate-400", "text-orange-700"];

function PositionCell({ pos }: { pos: number }) {
  if (pos <= 3) {
    const Icon = pos === 1 ? Trophy : Medal;
    return <Icon className={`h-5 w-5 ${PODIUM_COLORS[pos - 1]}`} aria-label={`Posición ${pos}`} />;
  }
  return <span className="text-sm font-medium text-muted-foreground">{pos}</span>;
}

function LeaderboardTable({ period }: { period: LeaderboardPeriod }) {
  const { data, isLoading } = useLeaderboard(period);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">#</TableHead>
          <TableHead>Nombre</TableHead>
          <TableHead className="text-right">Reportes</TableHead>
          <TableHead className="text-right">Aceptados</TableHead>
          <TableHead className="text-right">Resueltos</TableHead>
          <TableHead className="text-right">Puntos</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>}
        {!isLoading && (data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Aún no hay puntos otorgados en este periodo.</TableCell></TableRow>}
        {(data ?? []).map((row, i) => (
          <TableRow key={row.reporter_id} className="even:bg-muted/30">
            <TableCell><PositionCell pos={i + 1} /></TableCell>
            <TableCell className="font-medium">{row.reporter_name}</TableCell>
            <TableCell className="text-right">{row.total_reports}</TableCell>
            <TableCell className="text-right">{row.accepted_reports}</TableCell>
            <TableCell className="text-right">{row.resolved_reports}</TableCell>
            <TableCell className="text-right font-semibold">{row.total_points}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tabla de honor</h1>
        <p className="text-sm text-muted-foreground">Reconocimiento a quienes ayudan a mejorar LiftGo reportando bugs y proponiendo mejoras.</p>
      </div>
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
    </div>
  );
}
