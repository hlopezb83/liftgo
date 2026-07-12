import { X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivityFeed, type ActivityFilters } from "@/features/dashboard";
import type { AppRole } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { translateActivityTitle, translateActivityDescription } from "@/lib/domain/activityTranslations";
import { formatDateTimeShortMty } from "@/lib/format/dateFormats";
import { ENTITY_LABELS, ENTITY_ROUTES, EVENT_LABELS, EVENT_TYPES } from "../../lib/activityConstants";
import { ActorAvatar } from "./ActorAvatar";
import type { MemberStat } from "../../hooks/useActivityMetrics";

interface Props {
  filters: ActivityFilters;
  onFilterChange: (next: Partial<ActivityFilters>) => void;
  onReset: () => void;
  members: MemberStat[];
}

export function ActivityTimeline({ filters, onFilterChange, onReset, members }: Props) {
  const { data, isLoading } = useActivityFeed(200, filters);
  const navigate = useNavigateTransition();

  const hasFilter = Boolean(
    filters.actorId || filters.entityType || filters.eventType || filters.search
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm">Línea de tiempo</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={filters.actorId ?? "all"}
              onValueChange={(v) => onFilterChange({ actorId: v === "all" ? undefined : v })}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Usuario" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los usuarios</SelectItem>
                <SelectItem value="system">Sistema (automático)</SelectItem>
                {members.filter((m) => m.actorId).map((m) => (
                  <SelectItem key={m.actorId ?? ""} value={m.actorId ?? ""}>{m.actorName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.entityType ?? "all"}
              onValueChange={(v) => onFilterChange({ entityType: v === "all" ? undefined : v })}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Módulo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los módulos</SelectItem>
                {Object.entries(ENTITY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.eventType ?? "all"}
              onValueChange={(v) => onFilterChange({ eventType: v === "all" ? undefined : v })}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Acción" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las acciones</SelectItem>
                {EVENT_TYPES.map((e) => <SelectItem key={e} value={e}>{EVENT_LABELS[e]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar…"
              className="h-8 w-[180px] text-xs"
              value={filters.search ?? ""}
              onChange={(e) => onFilterChange({ search: e.target.value || undefined })}
            />
            {hasFilter && (
              <Button variant="ghost" size="sm" className="h-8" onClick={onReset}>
                <X className="h-3.5 w-3.5 mr-1" /> Limpiar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !data || data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Sin actividad con estos filtros</p>
        ) : (
          <div className="divide-y">
            {data.map((a, idx) => {
              const route = ENTITY_ROUTES[a.entity_type];
              const actorName = a.actor_name ?? "Sistema";
              const moduleLabel = ENTITY_LABELS[a.entity_type] ?? a.entity_type;
              const go = route
                ? () => navigate(route.includes(":id") ? route.replace(":id", a.entity_id) : route)
                : undefined;
              return (
                <div
                  key={a.id}
                  role={go ? "button" : undefined}
                  tabIndex={go ? 0 : undefined}
                  className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors ${idx % 2 === 0 ? "bg-background" : "bg-muted/10"} ${go ? "cursor-pointer" : ""}`}
                  onClick={go}
                  onKeyDown={go ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } } : undefined}
                >
                  <div className="w-[180px] shrink-0">
                    <ActorAvatar
                      name={actorName}
                      role={a.actor_role as AppRole | null}
                      size="sm"
                      isSystem={a.actor_id === null}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {translateActivityTitle(a.title, a.event_type, a.entity_type)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {translateActivityDescription(a.description, a.event_type, a.entity_type)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {moduleLabel}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                      {formatDateTimeShortMty(a.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
