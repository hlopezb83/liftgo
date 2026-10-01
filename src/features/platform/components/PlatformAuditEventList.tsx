import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PlatformAuditEvent } from "@/lib/platformAudit.types";
import {
  AUDIT_ACTION_LABELS,
  auditTargetName,
  PLATFORM_AUDIT_LABELS,
} from "../lib/platformAuditLabels";

export function PlatformAuditEventList({
  events,
  onSelect,
}: {
  events: PlatformAuditEvent[];
  onSelect: (event: PlatformAuditEvent) => void;
}) {
  if (!events.length)
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">Sin eventos para estos filtros</p>
          <p className="mt-2 text-sm text-muted-foreground">
            La bitácora no reconstruye cambios de catálogo anteriores a su
            habilitación.
          </p>
        </CardContent>
      </Card>
    );
  return (
    <>
      <Card className="hidden xl:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Ámbito / objetivo</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead className="text-right">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    <time dateTime={event.occurred_at}>
                      {new Date(event.occurred_at).toLocaleString("es-MX")}
                    </time>
                  </TableCell>
                  <TableCell>
                    <p className="max-w-72 break-words font-medium">
                      {auditTargetName(event)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {PLATFORM_AUDIT_LABELS[event.target_type]}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {AUDIT_ACTION_LABELS[event.action]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {event.actor_name ||
                      (event.actor_id
                        ? "Operador"
                        : "Servicio / no disponible")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSelect(event)}
                      aria-label={`Ver evento ${event.id}`}
                    >
                      Ver evento
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="space-y-3 xl:hidden">
        {events.map((event) => (
          <Card key={event.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline">
                  {AUDIT_ACTION_LABELS[event.action]}
                </Badge>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={event.occurred_at}
                >
                  {new Date(event.occurred_at).toLocaleString("es-MX")}
                </time>
              </div>
              <div>
                <p className="break-words text-sm font-medium">
                  {auditTargetName(event)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {PLATFORM_AUDIT_LABELS[event.target_type]}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {event.actor_name ||
                  (event.actor_id ? "Operador" : "Servicio / no disponible")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => onSelect(event)}
                aria-label={`Ver evento ${event.id}`}
              >
                Ver evento
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
