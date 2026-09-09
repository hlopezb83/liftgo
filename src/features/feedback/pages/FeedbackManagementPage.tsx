import { useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMtyDate } from "@/lib/utils";
import { FeedbackDetailSheet } from "../components/FeedbackDetailSheet";
import {
  useFeedbackReportById,
  useFeedbackReportsByStatus,
} from "../hooks/useFeedbackReports";
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  KANBAN_COLUMNS,
  type FeedbackStatus,
} from "../lib/constants";

function FeedbackKanbanColumn({
  status,
  onSelect,
}: {
  status: FeedbackStatus;
  onSelect: (id: string) => void;
}) {
  const query = useFeedbackReportsByStatus(status);
  const reports = query.data?.pages.flatMap((page) => page.rows) ?? [];
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {FEEDBACK_STATUS_LABELS[status]}
        </h3>
        <Badge variant="secondary" className="h-5 px-1.5 text-xs">{totalCount}</Badge>
      </div>
      <div className="space-y-2">
        {query.isPending ? (
          <p className="py-4 text-center text-2xs text-muted-foreground">Cargando…</p>
        ) : query.isError ? (
          <div className="space-y-2 rounded-md border border-destructive/40 p-2 text-center text-2xs text-destructive">
            <p>No se pudo cargar esta columna.</p>
            <Button size="sm" variant="outline" onClick={() => { void query.refetch(); }}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            {reports.map((r) => (
              <Card
                key={r.id}
                onClick={() => onSelect(r.id)}
                className="p-3 cursor-pointer hover:border-primary transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-mono text-3xs text-muted-foreground">{r.folio}</span>
                  <Badge variant="outline" className="h-4 px-1 text-3xs">
                    {FEEDBACK_TYPE_LABELS[r.type as "bug" | "improvement"]}
                  </Badge>
                </div>
                <p className="text-sm font-medium line-clamp-2">{r.title}</p>
                <div className="mt-2 flex items-center justify-between text-3xs text-muted-foreground">
                  <span className="truncate">{r.module}</span>
                  <span>{formatMtyDate(r.created_at, "dd/MM")}</span>
                </div>
              </Card>
            ))}
            {reports.length === 0 && (
              <div className="text-2xs text-muted-foreground text-center py-4 border border-dashed rounded-md">
                Vacío
              </div>
            )}
            {query.hasNextPage && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                disabled={query.isFetchingNextPage}
                onClick={() => { void query.fetchNextPage(); }}
              >
                {query.isFetchingNextPage ? "Cargando…" : "Cargar más"}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function FeedbackManagementPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: selected = null } = useFeedbackReportById(selectedId);

  return (
    <PageContainer>
      <PageHeader
        title="Gestión de Feedback"
        subtitle="Reportes de bugs y mejoras enviados por los usuarios."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {KANBAN_COLUMNS.map((status) => (
          <FeedbackKanbanColumn key={status} status={status} onSelect={setSelectedId} />
        ))}
      </div>

      <FeedbackDetailSheet report={selected} onClose={() => setSelectedId(null)} />
    </PageContainer>
  );
}
