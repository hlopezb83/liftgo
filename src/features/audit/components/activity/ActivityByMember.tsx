import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_LOCALE } from "@/lib/format/dateFormats";
import { ActorAvatar } from "./ActorAvatar";
import type { MemberStat } from "../../hooks/useActivityMetrics";

interface Props {
  members: MemberStat[];
  onSelect?: (actorId: string | null) => void;
  selectedActorId?: string | null;
}

export function ActivityByMember({ members, onSelect, selectedActorId }: Props) {
  const max = members[0]?.total ?? 1;
  const top = members.slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Ranking del equipo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {top.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Sin actividad en el rango</p>
        )}
        {top.map((m) => {
          const pct = Math.max(4, (m.total / max) * 100);
          const isActive = selectedActorId === (m.actorId ?? "system");
          return (
            <button
              key={m.actorId ?? "system"}
              onClick={() => onSelect?.(m.actorId)}
              className={`w-full text-left rounded-md p-2 transition-colors ${isActive ? "bg-accent" : "hover:bg-muted/50"}`}
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <ActorAvatar
                  name={m.actorName}
                  role={m.actorRole}
                  size="sm"
                  isSystem={m.actorId === null}
                />
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums">{m.total}</p>
                  <p className="text-3xs text-muted-foreground">
                    {formatDistanceToNow(new Date(m.lastAt), { locale: APP_LOCALE, addSuffix: true })}
                  </p>
                </div>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
