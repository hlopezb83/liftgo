import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Separator } from "@/components/ui/separator";
import type { Tables } from "@/integrations/supabase/types";
import { formatDateTimeMty } from "@/lib/format/dateFormats";
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "../lib/constants";
type FeedbackHistoryEntry = Tables<"feedback_status_history">;

type MetaItem = { label: string; value: string; breakAll?: boolean };

export function FeedbackMetaList({
  reporterName,
  reporterType,
  createdAt,
  ctx,
}: {
  reporterName: string | null;
  reporterType: string;
  createdAt: string;
  ctx: Record<string, unknown>;
}) {
  const items: MetaItem[] = [
    { label: "Reportado por", value: `${reporterName ?? "—"} (${reporterType})` },
    { label: "Fecha", value: formatDateTimeMty(createdAt) },
  ];
  if (ctx.route) items.push({ label: "Ruta", value: String(ctx.route) });
  if (ctx.viewport) items.push({ label: "Viewport", value: String(ctx.viewport) });
  if (ctx.app_version) items.push({ label: "Versión", value: String(ctx.app_version) });
  if (ctx.user_agent) items.push({ label: "UA", value: String(ctx.user_agent), breakAll: true });

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <div key={item.label} className={item.breakAll ? "break-all" : undefined}>
          <strong className="text-foreground">{item.label}:</strong> {item.value}
        </div>
      ))}
    </div>
  );
}

export function FeedbackHistoryList({
  history,
  isLoading = false,
  isError = false,
  onRetry,
}: {
  history: FeedbackHistoryEntry[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const list = history ?? [];
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Historial</h4>
      {isLoading && <p className="text-xs text-muted-foreground">Cargando historial…</p>}
      {isError && (
        <QueryErrorState entity="el historial del reporte" onRetry={() => onRetry?.()} bare />
      )}
      {!isLoading && !isError && list.length === 0 && (
        <p className="text-xs text-muted-foreground">Sin cambios todavía.</p>
      )}
      <ul className="space-y-2">
        {!isLoading && !isError && list.map((h) => {
          const fromLabel = h.from_status
            ? `${FEEDBACK_STATUS_LABELS[h.from_status as FeedbackStatus] ?? h.from_status} → `
            : "";
          const toLabel = FEEDBACK_STATUS_LABELS[h.to_status as FeedbackStatus] ?? h.to_status;
          return (
            <li key={h.id} className="text-xs border-l-2 border-border pl-3 py-1">
              <div className="font-medium">{fromLabel}{toLabel}</div>
              <div className="text-muted-foreground">{formatDateTimeMty(h.changed_at)}</div>
              {h.comment && <div className="text-muted-foreground italic mt-0.5">{h.comment}</div>}
            </li>
          );
        })}
      </ul>
      <Separator className="hidden" />
    </div>
  );
}
