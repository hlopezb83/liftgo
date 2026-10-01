import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlatformAuditEvent } from "@/lib/platformAudit.types";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_FIELD_LABELS,
  auditTargetName,
  auditValue,
  PLATFORM_AUDIT_LABELS,
} from "../lib/platformAuditLabels";

export function PlatformAuditEventDialog({
  event,
  onClose,
}: {
  event: PlatformAuditEvent | null;
  onClose: () => void;
}) {
  const oldState = event?.old_state ?? {};
  const newState = event?.new_state ?? {};
  const keys = Array.from(
    new Set([...Object.keys(oldState), ...Object.keys(newState)]),
  );
  const rows = keys.filter(
    (key) =>
      event?.action !== "UPDATE" ||
      Reflect.get(oldState, key) !== Reflect.get(newState, key),
  );
  return (
    <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalle del evento</DialogTitle>
          <DialogDescription>
            Registro de plataforma. Sólo incluye los campos administrativos
            permitidos.
          </DialogDescription>
        </DialogHeader>
        {event && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {PLATFORM_AUDIT_LABELS[event.target_type]}
                </Badge>
                <Badge variant="secondary">
                  {AUDIT_ACTION_LABELS[event.action]}
                </Badge>
                {event.is_legacy && (
                  <Badge variant="outline">Histórico recuperado</Badge>
                )}
              </div>
              <p className="break-words font-medium">
                {auditTargetName(event)}
              </p>
              <p className="text-sm text-muted-foreground">
                {event.actor_name ||
                  (event.actor_id
                    ? "Operador sin nombre disponible"
                    : "Servicio / actor no disponible")}{" "}
                · {new Date(event.occurred_at).toLocaleString("es-MX")}
              </p>
            </div>
            {event.reason && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Motivo
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                  {event.reason}
                </p>
              </div>
            )}
            {rows.length ? (
              <div className="divide-y rounded-lg border">
                {rows.map((key) => (
                  <div key={key} className="space-y-2 p-3">
                    <p className="text-xs font-medium">
                      {AUDIT_FIELD_LABELS[key] ?? key.replaceAll("_", " ")}
                    </p>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-muted-foreground">Antes</dt>
                        <dd className="mt-1 break-all text-sm">
                          {auditValue(Reflect.get(oldState, key))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Después
                        </dt>
                        <dd className="mt-1 break-all text-sm">
                          {auditValue(Reflect.get(newState, key))}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Este evento no contiene diferencias en campos mostrables.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Campos modificados:{" "}
              {event.changed_fields
                .map(
                  (field) =>
                    AUDIT_FIELD_LABELS[field] ?? field.replaceAll("_", " "),
                )
                .join(", ") || "No registrados en el evento histórico"}
              . El contenido legal y la metadata no se almacenan aquí.
            </p>
            <dl className="space-y-2 border-t pt-4 text-xs">
              <div>
                <dt className="text-muted-foreground">Objetivo</dt>
                <dd className="break-all font-mono">{event.target_id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ID de operación</dt>
                <dd className="break-all font-mono">{event.request_id}</dd>
              </div>
            </dl>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
