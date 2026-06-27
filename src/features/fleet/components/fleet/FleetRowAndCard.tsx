import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { FUEL_TYPE_LABELS } from "@/lib/constants";
import type { Forklift } from "../../hooks/forklifts/useForklifts";

interface CardProps {
  forklift: Forklift;
  hasActivePolicy: boolean;
  onClick: () => void;
}

export function FleetMobileCard({ forklift: f, hasActivePolicy, onClick }: CardProps) {
  return (
    <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono font-semibold text-sm flex items-center gap-1.5">
            {f.name}
            {hasActivePolicy && <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />}
          </span>
          <StatusBadge status={f.status} />
        </div>
        <p className="text-sm text-muted-foreground">{f.model}</p>
        {f.serial_number && <p className="text-xs text-muted-foreground font-mono">S/N: {f.serial_number}</p>}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex gap-4 text-xs text-muted-foreground">
            {f.fuel_type && <span>{FUEL_TYPE_LABELS[f.fuel_type] || f.fuel_type}</span>}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
