import { useActivityFeed } from "@/hooks/useActivityFeed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Activity } from "lucide-react";

export function RecentActivity() {
  const { data: activities } = useActivityFeed(5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" /> Actividad Reciente
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities && activities.length > 0 ? (
          <div className="space-y-3">
            {activities.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{format(new Date(a.created_at), "MMM d, HH:mm")}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">Sin actividad aún</p>
        )}
      </CardContent>
    </Card>
  );
}
