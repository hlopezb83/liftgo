import { Badge } from "@/components/ui/badge";
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "../lib/constants";

const VARIANT: Record<FeedbackStatus, string> = {
  new: "bg-info/10 text-info border-info/30",
  triage: "bg-[hsl(var(--chart-5)/0.1)] text-[hsl(var(--chart-5))] border-[hsl(var(--chart-5)/0.3)]",
  accepted: "bg-[hsl(var(--chart-3)/0.1)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.3)]",
  in_progress: "bg-warning/10 text-warning border-warning/30",
  resolved: "bg-success/10 text-success border-success/30",
  closed: "bg-muted text-muted-foreground border-border",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
  duplicate: "bg-muted text-muted-foreground border-border",
};

export function FeedbackStatusBadge({ status }: { status: string }) {
  const s = status as FeedbackStatus;
  return (
    <Badge variant="outline" className={VARIANT[s] ?? ""}>
      {FEEDBACK_STATUS_LABELS[s] ?? status}
    </Badge>
  );
}
