import { ArrowRight } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS } from "../../hooks/useProspectForm";

interface Props {
  fromStage: string;
  toStage: string;
}

export function ProspectStageBadge({ fromStage, toStage }: Props) {
  return (
    <div className="flex items-center gap-2 mt-2 text-sm">
      <Badge variant="secondary">{STAGE_LABELS[fromStage] ?? fromStage}</Badge>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
      <Badge>{STAGE_LABELS[toStage] ?? toStage}</Badge>
    </div>
  );
}
