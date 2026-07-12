import { Sparkles, SpinnerIcon, RefreshIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_SEVERITY_LABELS,
} from "../lib/constants";

interface ChipsProps {
  type: string;
  module: string;
  severity: string | null;
  hasAi: boolean;
  classifying: boolean;
  points: number;
}

export function FeedbackChipsRow({ type, module, severity, hasAi, classifying, points }: ChipsProps) {
  const severityLabel = severity
    ? FEEDBACK_SEVERITY_LABELS[severity as keyof typeof FEEDBACK_SEVERITY_LABELS]
    : null;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Badge variant="outline">{FEEDBACK_TYPE_LABELS[type as "bug" | "improvement"]}</Badge>
      <Badge variant={module === "Sin clasificar" ? "secondary" : "outline"}>{module}</Badge>
      {severityLabel && <Badge variant="outline">{severityLabel}</Badge>}
      {hasAi && (
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="h-3 w-3" /> AI
        </Badge>
      )}
      {classifying && (
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <SpinnerIcon className="h-3 w-3 animate-spin" /> Clasificando con AI…
        </span>
      )}
      <Badge variant="secondary" className="ml-auto">{points} pts</Badge>
    </div>
  );
}

interface AiCardProps {
  reasoning: string;
  onReclassify: () => void;
  reclassifying: boolean;
}

export function AiReasoningCard({ reasoning, onReclassify, reclassifying }: AiCardProps) {
  return (
    <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2 border">
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Razonamiento del AI
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={onReclassify}
          disabled={reclassifying}
        >
          <RefreshIcon className="h-3 w-3 mr-1" /> Reclasificar
        </Button>
      </div>
      <p>{reasoning}</p>
    </div>
  );
}
