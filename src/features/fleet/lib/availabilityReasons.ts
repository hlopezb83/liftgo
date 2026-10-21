/** Explanations are evidence only. They never replace the availability RPC. */
export interface AvailabilityUnit {
  id: string;
  name: string;
  model: string;
  status: string;
  organization_id: string;
}

export interface AvailabilityBooking {
  id: string;
  forklift_id: string;
  organization_id: string;
  status: string;
  start_date: string;
  end_date: string;
}

export type AvailabilityReasonCode = "retired" | "sold" | "maintenance" | "return_pending" | "reservation" | "rented" | "unknown";

export interface AvailabilityReason {
  code: AvailabilityReasonCode;
  label: string;
  detail: string;
  nextAction: string;
}

export function explainUnavailableUnit({ unit, maintenanceBlocked, overdueUnreturned, overlappingBooking }: {
  unit: AvailabilityUnit;
  maintenanceBlocked?: boolean;
  overdueUnreturned?: boolean;
  overlappingBooking?: Pick<AvailabilityBooking, "start_date" | "end_date">;
}): AvailabilityReason {
  // A calendar gap cannot override a physical or operational restriction.
  if (unit.status === "retired" || unit.status === "sold") {
    return {
      code: unit.status,
      label: unit.status === "retired" ? "Equipo dado de baja" : "Equipo vendido",
      detail: "El estado registrado excluye esta unidad de las reservas.",
      nextAction: "Selecciona otra unidad. Si el registro no corresponde, solicita revisión al Administrador.",
    };
  }
  if (unit.status === "maintenance" || maintenanceBlocked === true) {
    return {
      code: "maintenance",
      label: "Mantenimiento o daño bloqueante",
      detail: unit.status === "maintenance"
        ? "La unidad tiene estado operativo En mantenimiento."
        : "El servidor confirmó un bloqueo de mantenimiento o daño para estas fechas.",
      nextAction: "Solicita a Mantenimiento revisar la orden, el daño o la ventana de servicio. Vuelve a consultar después de su resolución.",
    };
  }
  if (overdueUnreturned === true) {
    return {
      code: "return_pending",
      label: "Devolución pendiente de registrar",
      detail: "Existe una reserva confirmada vencida sin devolución registrada. Un hueco en el calendario no libera la unidad.",
      nextAction: "Solicita a Operaciones verificar la custodia y completar la devolución real mediante el flujo autorizado.",
    };
  }
  if (overlappingBooking) {
    return {
      code: "reservation",
      label: "Reserva en las fechas seleccionadas",
      detail: `Existe una reserva del ${overlappingBooking.start_date} al ${overlappingBooking.end_date}. Ambos días están incluidos.`,
      nextAction: "Elige otra unidad u otras fechas. Revisa la reserva en el calendario si tienes acceso.",
    };
  }
  if (unit.status === "rented") {
    return {
      code: "rented",
      label: "Estado operativo Rentado",
      detail: "La unidad está registrada como Rentado. No se pudo confirmar el bloqueo específico de estas fechas con la información disponible.",
      nextAction: "Solicita a Operaciones verificar la entrega, la custodia y la devolución registradas. No cambies el estado para forzar disponibilidad.",
    };
  }
  return {
    code: "unknown",
    label: "Motivo no confirmado",
    detail: "El servidor no ofrece esta unidad para las fechas seleccionadas, pero no hay evidencia suficiente para explicar el motivo.",
    nextAction: "Actualiza la consulta y solicita revisión a Operaciones si persiste. No fuerces el estado del equipo.",
  };
}

export function overlapsRequestedRange(booking: AvailabilityBooking, start: string, end: string): boolean {
  return !["completed", "cancelled"].includes(booking.status)
    && booking.start_date <= end && booking.end_date >= start;
}
