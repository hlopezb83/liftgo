import { useActivityFeed } from "@/features/audit/hooks/useActivityFeed";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { translateActivityTitle, translateActivityDescription } from "@/lib/activityTranslations";

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

const ENTITY_TYPES = ["all", "bookings", "invoices", "forklifts", "contracts", "quotes", "customers", "return_inspections", "maintenance_logs", "damage_records", "deliveries", "payments"];
const ENTITY_LABELS: Record<string, string> = {
  all: "Todos",
  bookings: "Reservas",
  invoices: "Facturas",
  forklifts: "Montacargas",
  contracts: "Contratos",
  quotes: "Cotizaciones",
  customers: "Clientes",
  return_inspections: "Inspecciones de devolución",
  maintenance_logs: "Mantenimiento",
  damage_records: "Daños",
  deliveries: "Entregas",
  payments: "Pagos",
};

export default function ActivityPage() {
  const [filter, setFilter] = useState("all");
  const { data: activities, isLoading } = useActivityFeed(100, filter === "all" ? undefined : filter);
  const navigate = useNavigate();

  const filterControl = (
    <Select value={filter} onValueChange={setFilter}>
      <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{ENTITY_LABELS[t] || t}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  if (isLoading) {
    return (
      <PageTransition>
        <div className="p-6 space-y-6">
          <PageHeader title="Actividad Reciente" subtitle="Eventos recientes del sistema" />
          {filterControl}
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        </div>
      </PageTransition>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <PageTransition>
        <div className="p-6 space-y-6">
          <PageHeader title="Actividad Reciente" subtitle="Eventos recientes del sistema" />
          {filterControl}
          <p className="text-center text-muted-foreground py-10">Sin actividad aún</p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader title="Actividad Reciente" subtitle="Eventos recientes del sistema" />
        {filterControl}
        <div className="space-y-2">
          {activities.map((a) => (
            <Card
              key={a.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => {
                const route = ENTITY_ROUTES[a.entity_type];
                if (route) navigate(route.includes(":id") ? route.replace(":id", a.entity_id) : route);
              }}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{translateActivityTitle(a.title, a.event_type, a.entity_type)}</p>
                  <p className="text-xs text-muted-foreground">{translateActivityDescription(a.description, a.event_type, a.entity_type)}</p>
                </div>
                <div className="text-right shrink-0">
                  <StatusBadge status={a.event_type} />
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(a.created_at), "dd/MM/yyyy HH:mm")}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PageTransition>
  );
}