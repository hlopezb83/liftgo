import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAllFeedbackReports, type FeedbackReport } from "../hooks/useFeedbackReports";
import { FeedbackDetailSheet } from "../components/FeedbackDetailSheet";
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  KANBAN_COLUMNS,
  type FeedbackStatus,
} from "../lib/constants";
import { format } from "date-fns";

export default function FeedbackManagementPage() {
  const { data: reports, isLoading } = useAllFeedbackReports();
  const [selected, setSelected] = useState<FeedbackReport | null>(null);

  const grouped = (() => {
    const acc: Record<FeedbackStatus, FeedbackReport[]> = {
      new: [], triage: [], accepted: [], in_progress: [], resolved: [], closed: [], rejected: [], duplicate: [],
    };
    for (const r of reports ?? []) acc[r.status as FeedbackStatus]?.push(r);
    return acc;
  })();

  return (
    <PageContainer>
      <PageHeader
        title="Gestión de Feedback"
        subtitle="Reportes de bugs y mejoras enviados por los usuarios."
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {KANBAN_COLUMNS.map((status) => (
            <div key={status} className="space-y-2 min-w-0">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {FEEDBACK_STATUS_LABELS[status]}
                </h3>
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">{grouped[status].length}</Badge>
              </div>
              <div className="space-y-2">
                {grouped[status].map((r) => (
                  <Card
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="p-3 cursor-pointer hover:border-primary transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-[10px] text-muted-foreground">{r.folio}</span>
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                        {FEEDBACK_TYPE_LABELS[r.type as "bug" | "improvement"]}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium line-clamp-2">{r.title}</p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="truncate">{r.module}</span>
                      <span>{format(new Date(r.created_at), "dd/MM")}</span>
                    </div>
                  </Card>
                ))}
                {grouped[status].length === 0 && (
                  <div className="text-[11px] text-muted-foreground text-center py-4 border border-dashed rounded-md">
                    Vacío
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <FeedbackDetailSheet report={selected} onClose={() => setSelected(null)} />
    </PageContainer>
  );
}
