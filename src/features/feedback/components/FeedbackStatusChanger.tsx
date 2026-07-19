import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "../lib/constants";

interface Props {
  currentStatus: string;
  newStatus: FeedbackStatus | "";
  onNewStatusChange: (s: FeedbackStatus | "") => void;
  comment: string;
  onCommentChange: (v: string) => void;
  onApply: () => void;
  pending: boolean;
}

export function FeedbackStatusChanger({
  currentStatus,
  newStatus,
  onNewStatusChange,
  comment,
  onCommentChange,
  onApply,
  pending,
}: Props) {
  const disabled = !newStatus || pending;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Cambiar estado</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Select value={newStatus} onValueChange={(v) => onNewStatusChange(v as FeedbackStatus)}>
          <SelectTrigger><SelectValue placeholder="Nuevo estado" /></SelectTrigger>
          <SelectContent>
            {Object.entries(FEEDBACK_STATUS_LABELS)
              .filter(([k]) => k !== currentStatus)
              .map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button disabled={disabled} onClick={onApply}>
          {pending ? "Guardando…" : "Aplicar"}
        </Button>
      </div>
      <Textarea
        placeholder="Comentario (opcional)"
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        rows={2}
      />
    </div>
  );
}
