import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TrendingUp, Trophy, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import type { CRMMetrics } from "@/hooks/crm/useCRMMetrics";

interface Props {
  metrics: CRMMetrics;
}

export function CRMHeaderKPIs({ metrics }: Props) {
  return (
    <div className="flex items-center gap-4 flex-wrap text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Pipeline:</span>
        <span className="font-semibold tabular-nums">
          {metrics.activeCount} · {formatCurrency(metrics.activeTotal)}
        </span>
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Win rate 30d:</span>
        <span className="font-semibold tabular-nums">{metrics.winRate30d}%</span>
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-1.5">
        <Trophy className="h-3.5 w-3.5 text-success" />
        <span className="text-muted-foreground">Ganados mes:</span>
        <span className="font-semibold tabular-nums">
          {metrics.wonCountMTD} · {formatCurrency(metrics.wonTotalMTD)}
        </span>
      </div>
      <Button asChild variant="ghost" size="sm" className="h-7 text-xs ml-auto">
        <Link to="/crm/cerrados">
          Ver historial <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Link>
      </Button>
    </div>
  );
}
