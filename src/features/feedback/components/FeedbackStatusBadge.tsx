import { Badge } from "@/components/ui/badge";
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "../lib/constants";

const VARIANT: Record<FeedbackStatus, string> = {
  new: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  triage: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
  accepted: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  in_progress: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  resolved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
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
