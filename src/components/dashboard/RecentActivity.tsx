import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Activity } from "lucide-react";
import { translateActivityTitle, translateActivityDescription } from "@/lib/activityTranslations";
import { useNavigate } from "react-router-dom";

const ENTITY_ROUTES: Record<string, string> = {
  forklifts: "/fleet/:id",
  invoices: "/invoices/:id",
  contracts: "/contracts/:id",
  quotes: "/quotes/:id",
  customers: "/customers/:id",
  bookings: "/calendar",
  return_inspections: "/returns",
  maintenance_logs: "/maintenance",
  damage_records: "/damage",
  deliveries: "/deliveries",
  payments: "/invoices",
};

export function RecentActivity() {
  const { data: stats } = useDashboardStats();
  const activities = stats?.recent_activity ?? [];
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" /> Actividad Reciente
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length > 0 ? (
          <div className="space-y-3">
            {activities.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between text-sm cursor-pointer rounded-md px-2 py-1 -mx-2 hover:bg-muted/50 transition-colors"
                onClick={() => {
                  const route = ENTITY_ROUTES[a.entity_type];
                  if (route) navigate(route.includes(":id") ? route.replace(":id", a.entity_id) : route);
                }}
              >
                <div>
                  <p className="font-medium">{translateActivityTitle(a.title, a.event_type, a.entity_type)}</p>
                   <p className="text-xs text-muted-foreground">{translateActivityDescription(a.description, a.event_type, a.entity_type)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{format(new Date(a.created_at), "dd/MM HH:mm")}</p>
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
