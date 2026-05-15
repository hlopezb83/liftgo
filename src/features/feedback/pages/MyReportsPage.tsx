import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useMyFeedbackReports } from "@/features/feedback/hooks/useFeedbackReports";
import { FeedbackStatusBadge } from "@/features/feedback/components/FeedbackStatusBadge";
import { FEEDBACK_TYPE_LABELS } from "@/features/feedback/lib/constants";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { format } from "date-fns";

export default function MyReportsPage() {
  const { data: reports, isLoading } = useMyFeedbackReports();
  const { paginatedItems, page, setPage, totalPages } = usePagination(reports ?? []);

  const totalPoints = useMemo(
    () => (reports ?? []).reduce((sum, r) => sum + (r.points_awarded ?? 0), 0),
    [reports],
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mis reportes</h1>
          <p className="text-sm text-muted-foreground">Tus bugs reportados y mejoras propuestas.</p>
        </div>
        <Badge variant="secondary" className="text-base px-3 py-1.5">
          {totalPoints} puntos
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{reports?.length ?? 0} reportes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Puntos</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
              )}
              {!isLoading && paginatedItems.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin reportes todavía. Usa el botón “Reportar” para enviar el primero.</TableCell></TableRow>
              )}
              {paginatedItems.map((r) => (
                <TableRow key={r.id} className="even:bg-muted/30">
                  <TableCell className="font-mono text-xs">{r.folio}</TableCell>
                  <TableCell>{FEEDBACK_TYPE_LABELS[r.type as "bug" | "improvement"] ?? r.type}</TableCell>
                  <TableCell className="text-sm">{r.module}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{r.title}</TableCell>
                  <TableCell><FeedbackStatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right font-medium">{r.points_awarded}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(r.created_at), "dd/MM/yyyy")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        {totalPages > 1 && (
          <div className="border-t p-3">
            <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
