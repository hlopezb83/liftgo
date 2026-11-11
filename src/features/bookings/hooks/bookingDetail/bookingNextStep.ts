import { isHistoricallyReconciled, type HistoricalDeliveryLike } from "@/features/deliveries";
import type { Tables } from "@/integrations/supabase/types";
import { hasReachedListLimit } from "@/lib/supabase/constants";
import { returnActionAvailability } from "../bookingActions/returnActionAvailability";

type BookingState = Pick<Tables<"bookings">, "status" | "start_date" | "end_date" | "return_status">;
export type BookingTransport = HistoricalDeliveryLike & Pick<Tables<"deliveries">,
  "id" | "type" | "status" | "completed_at">;
export type BookingNextAction =
  | { kind: "schedule"; type: "delivery" | "pickup"; label: string }
  | { kind: "transport"; id: string; label: string }
  | { kind: "return"; early: boolean; label: string }
  | { kind: "review"; label: string };
export interface BookingNextStep {
  description: string;
  action?: BookingNextAction;
}

/** A suggestion from verified facts, never a new lifecycle/permission rule. */
export function bookingNextStep(
  booking: BookingState,
  transports: { deliveries: BookingTransport[] | undefined; isLoading: boolean; isError: boolean },
  today: string,
): BookingNextStep {
  if (booking.status === "cancelled") return { description: "Reserva cancelada. Consulta las operaciones y el historial vinculados." };
  if (booking.status === "completed" || booking.return_status != null) {
    return { description: "La renta ya tiene cierre o devolución registrados. Revisa sus documentos y la facturación pendiente." };
  }
  if (booking.status !== "confirmed") return { description: "Consulta el estatus y las acciones disponibles de esta reserva." };
  if (transports.isError) return { description: "No se pudo verificar el siguiente paso. Reintenta la consulta de transportes." };
  if (transports.isLoading || !transports.deliveries) return { description: "Comprobando los transportes de esta reserva…" };

  return verifiedNextStep(booking, transports.deliveries, today);
}

function verifiedNextStep(booking: BookingState, deliveries: BookingTransport[], today: string): BookingNextStep {
  const review: BookingNextAction = { kind: "review", label: "Revisar transportes" };
  if (hasReachedListLimit(deliveries)) return { description: "La lista de transportes está incompleta. Revisa los registros antes de programar otra operación.", action: review };
  if (deliveries.some(isHistoricallyReconciled)) return { description: "Esta reserva contiene historial conciliado. Revisa sus registros antes de continuar la operación.", action: review };

  const active = deliveries.filter((d) => ["scheduled", "in_transit"].includes(d.status));
  if (active.length > 1) return { description: "Hay varios transportes pendientes vinculados. Revisa su programación antes de crear otro.", action: review };
  if (active.length === 1) {
    return activeTransportStep(active[0]);
  }

  const returnAction = returnActionAvailability(booking, { deliveries, isLoading: false, isError: false }, today);
  if (!returnAction.block) {
    if (deliveries.some((d) => d.type === "pickup" && d.status === "completed")) {
      return { description: "La recolección está completada. Continúa con la inspección de devolución.",
        action: { kind: "return", early: returnAction.isEarly, label: "Inspeccionar devolución" } };
    }
    return { description: "La entrega está completada. Programa la recolección; si el equipo ya regresó, la devolución está disponible en Más acciones.",
      action: { kind: "schedule", type: "pickup", label: "Programar recolección" } };
  }
  // A completed/unknown record cannot be treated as absence of an operation.
  if (deliveries.some((d) => d.status !== "cancelled") || booking.end_date < today) {
    return { description: "Revisa las fechas y la evidencia de entrega antes de continuar. No hay una entrega válida comprobada para la devolución.", action: review };
  }
  return { description: "No hay una entrega pendiente o completada. Programa la entrega con los datos de esta reserva.",
    action: { kind: "schedule", type: "delivery", label: "Programar entrega" } };
}

function activeTransportStep(transport: BookingTransport): BookingNextStep {
  const name = transport.type === "delivery" ? "entrega" : transport.type === "pickup" ? "recolección" : "operación";
  return {
    description: `Ya existe una ${name} ${transport.status === "in_transit" ? "en tránsito" : "programada"}. Continúa desde ese transporte.`,
    action: { kind: "transport", id: transport.id, label: `Ver ${name}` },
  };
}
