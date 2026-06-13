import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModuleStat } from "../../hooks/useActivityMetrics";
import { ENTITY_LABELS } from "../../lib/activityConstants";

interface Props {
  modules: ModuleStat[];
  onSelect?: (entityType: string) => void;
  selected?: string;
}

export function ActivityByModule({ modules, onSelect, selected }: Props) {
  const max = modules[0]?.total ?? 1;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Acciones por módulo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {modules.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Sin actividad en el rango</p>
        )}
        {modules.map((m) => {
          const pct = Math.max(4, (m.total / max) * 100);
          const isActive = selected === m.entityType;
          return (
            <button
              key={m.entityType}
              onClick={() => onSelect?.(m.entityType)}
              className={`w-full text-left rounded-md p-2 transition-colors ${isActive ? "bg-accent" : "hover:bg-muted/50"}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{ENTITY_LABELS[m.entityType] ?? m.entityType}</span>
                <span className="text-xs font-semibold tabular-nums">{m.total}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
