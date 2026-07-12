import { TrendingDownIcon, TrendingUpIcon, ActivityIcon, UsersIcon, Layers, ClockIcon } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ENTITY_LABELS } from "../../lib/activityConstants";
import type { ActivityMetrics } from "../../hooks/useActivityMetrics";

interface Props {
  metrics: ActivityMetrics;
  rangeLabel: string;
}

export function ActivityKPIs({ metrics, rangeLabel }: Props) {
  const delta = metrics.totalPrevious === 0
    ? metrics.totalCurrent > 0 ? 100 : 0
    : Math.round(((metrics.totalCurrent - metrics.totalPrevious) / metrics.totalPrevious) * 100);
  const isUp = delta >= 0;

  const cards = [
    {
      icon: ActivityIcon,
      label: `Acciones · ${rangeLabel}`,
      value: metrics.totalCurrent.toLocaleString("es-MX"),
      hint: (
        <span className={cn("flex items-center gap-1 text-xs", isUp ? "text-success" : "text-destructive")}>
          {isUp ? <TrendingUpIcon className="h-3 w-3" /> : <TrendingDownIcon className="h-3 w-3" />}
          {Math.abs(delta)}% vs. anterior
        </span>
      ),
    },
    {
      icon: UsersIcon,
      label: "Usuarios activos",
      value: metrics.uniqueActors.toLocaleString("es-MX"),
      hint: <span className="text-xs text-muted-foreground">personas con actividad</span>,
    },
    {
      icon: Layers,
      label: "Módulo más usado",
      value: metrics.topModule ? (ENTITY_LABELS[metrics.topModule] ?? metrics.topModule) : "—",
      hint: <span className="text-xs text-muted-foreground">por número de acciones</span>,
    },
    {
      icon: ClockIcon,
      label: "Hora pico",
      value: metrics.peakHour !== null ? `${String(metrics.peakHour).padStart(2, "0")}:00` : "—",
      hint: <span className="text-xs text-muted-foreground">mayor concentración</span>,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold tabular-nums">{c.value}</p>
            <div className="mt-1">{c.hint}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
