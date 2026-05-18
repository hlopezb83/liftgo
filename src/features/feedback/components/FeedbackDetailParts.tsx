import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@/features/feedback/lib/constants";
import type { FeedbackHistoryEntry } from "@/features/feedback/hooks/useFeedbackReports";

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
    { label: "Fecha", value: format(new Date(createdAt), "dd/MM/yyyy HH:mm") },
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

export function FeedbackHistoryList({ history }: { history: FeedbackHistoryEntry[] | undefined }) {
  const list = history ?? [];
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Historial</h4>
      {list.length === 0 && <p className="text-xs text-muted-foreground">Sin cambios todavía.</p>}
      <ul className="space-y-2">
        {list.map((h) => {
          const fromLabel = h.from_status
            ? `${FEEDBACK_STATUS_LABELS[h.from_status as FeedbackStatus] ?? h.from_status} → `
            : "";
          const toLabel = FEEDBACK_STATUS_LABELS[h.to_status as FeedbackStatus] ?? h.to_status;
          return (
            <li key={h.id} className="text-xs border-l-2 border-border pl-3 py-1">
              <div className="font-medium">{fromLabel}{toLabel}</div>
              <div className="text-muted-foreground">{format(new Date(h.changed_at), "dd/MM/yyyy HH:mm")}</div>
              {h.comment && <div className="text-muted-foreground italic mt-0.5">{h.comment}</div>}
            </li>
          );
        })}
      </ul>
      <Separator className="hidden" />
    </div>
  );
}
