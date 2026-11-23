import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { HistoryIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateMty, formatDateTimeMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import {
  useBookingStatusHistory,
  type BookingHistoryLog,
} from "../../hooks/bookingDetail/useBookingStatusHistory";

interface BookingStatusHistoryProps {
  bookingId: string;
}

const FIELD_LABELS: Record<string, string> = {
  status: "Estatus",
  start_date: "Fecha inicio",
  end_date: "Fecha fin",
  daily_rate: "Tarifa diaria",
  weekly_rate: "Tarifa semanal",
  monthly_rate: "Tarifa mensual",
  included_hours: "Horas incluidas",
  extra_hour_rate: "Tarifa hora extra",
  forklift_id: "Equipo asignado",
  customer_id: "Cliente",
  customer_name: "Cliente",
  customer_contact: "Contacto cliente",
  site_contact_name: "Contacto en sitio",
  site_contact_phone: "Teléfono en sitio",
  notes: "Notas",
  delivery_address: "Dirección de entrega",
  booking_number: "Folio",
  currency: "Moneda",
  recurring_billing: "Facturación recurrente",
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
};

const DATE_FIELDS = new Set(["start_date", "end_date"]);
const CURRENCY_FIELDS = new Set([
  "daily_rate",
  "weekly_rate",
  "monthly_rate",
  "extra_hour_rate",
]);
const HIDDEN_FIELDS = new Set([
  "version",
  "updated_at",
  "created_at",
  "is_e2e",
]);

function shortId(value: string): string {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function formatValue(field: string, value: unknown, currency: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (DATE_FIELDS.has(field)) {
    try {
      return formatDateMty(String(value));
    } catch {
      return String(value);
    }
  }
  if (CURRENCY_FIELDS.has(field) && typeof value === "number") {
    return formatCurrencyWithCode(value, currency);
  }
  if (field === "forklift_id" || field === "customer_id") {
    return shortId(String(value));
  }
  if (field === "recurring_billing" && typeof value === "boolean") return value ? "Activada" : "Desactivada";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getField(data: Record<string, unknown> | null, key: string): unknown {
  return data ? data[key] : null;
}

interface ChangeRowProps {
  field: string;
  oldVal: unknown;
  newVal: unknown;
  oldCurrency: string;
  newCurrency: string;
}

function ChangeRow({ field, oldVal, newVal, oldCurrency, newCurrency }: ChangeRowProps) {
  const label = FIELD_LABELS[field] ?? field;

  if (field === "status") {
    return (
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className="text-muted-foreground">{label}:</span>
        {oldVal ? (
          <StatusBadge status={String(oldVal)} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        <span className="text-muted-foreground">→</span>
        {newVal ? (
          <StatusBadge status={String(newVal)} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    );
  }

  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="line-through text-muted-foreground">
        {formatValue(field, oldVal, oldCurrency)}
      </span>{" "}
      <span className="text-muted-foreground">→</span>{" "}
      <span className="font-medium">
        {formatValue(field, newVal, newCurrency)}
      </span>
    </div>
  );
}

function HistoryEntry({ log }: { log: BookingHistoryLog }) {
  const author = log.user_name ?? "Sistema";
  const actionLabel = ACTION_LABELS[log.action] ?? log.action;
  const oldCurrency = log.old_data?.currency as string | undefined;
  const newCurrency = log.new_data?.currency as string | undefined;

  const fields = (log.changed_fields ?? []).filter(
    (f) => !HIDDEN_FIELDS.has(f),
  );

  return (
    <div className="relative pl-6 pb-4 border-l border-border last:border-l-transparent last:pb-0">
      <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {formatDateTimeMty(log.created_at)}
        </span>
        <span>·</span>
        <span>{author}</span>
        <span>·</span>
        <span>{actionLabel}</span>
      </div>

      <div className="mt-2 space-y-1">
        {log.action === "INSERT" ? (
          <p className="text-sm">Reserva creada</p>
        ) : log.action === "DELETE" ? (
          <p className="text-sm">Reserva eliminada</p>
        ) : fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin cambios visibles
          </p>
        ) : (
          fields.map((f) => (
            <ChangeRow
              key={f}
              field={f}
              oldVal={getField(log.old_data, f)}
              newVal={getField(log.new_data, f)}
              oldCurrency={oldCurrency ?? newCurrency ?? "MXN"}
              newCurrency={newCurrency ?? oldCurrency ?? "MXN"}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function BookingStatusHistory({ bookingId }: BookingStatusHistoryProps) {
  const query = useBookingStatusHistory(bookingId);
  const { data: logs = [], isLoading } = query;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-muted-foreground" />
          Historial de la Reserva
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isError && <QueryErrorState bare entity="el historial de la reserva" error={query.error}
          isRetrying={query.isFetching} onRetry={() => { void query.refetch(); }} />}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : logs.length > 0 ? (
          <div className="space-y-0">
            {logs.map((log) => <HistoryEntry key={log.id} log={log} />)}
          </div>
        ) : query.isSuccess ? (
          <p className="text-sm text-muted-foreground">
            Sin actividad registrada
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
