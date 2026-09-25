import { describe, expect, it } from "vitest";
import { returnActionAvailability, type DeliveryState } from "../returnActionAvailability";

const today = "2026-09-24";
const booking = {
  start_date: "2026-09-20",
  end_date: "2026-09-28",
  return_status: null,
};
const completedDelivery: DeliveryState = { type: "delivery", status: "completed" };
const ready = { deliveries: [completedDelivery], isLoading: false, isError: false };

describe("returnActionAvailability", () => {
  it("bloquea una reserva futura aunque la entrega figure completa", () => {
    const result = returnActionAvailability({ ...booking, start_date: "2026-12-01" }, ready, today);
    expect(result.block?.code).toBe("booking_return_not_started");
  });

  it("exige una entrega completada, no una recolección ni una entrega programada", () => {
    const result = returnActionAvailability(booking, {
      ...ready,
      deliveries: [
        { type: "pickup", status: "completed" },
        { type: "delivery", status: "scheduled" },
      ],
    }, today);
    expect(result.block?.code).toBe("booking_return_delivery_unverified");
  });

  it("no confunde la carga o error de transportes con ausencia de entrega", () => {
    const loading = returnActionAvailability(booking, { ...ready, deliveries: undefined, isLoading: true }, today);
    const failed = returnActionAvailability(booking, { ...ready, deliveries: undefined, isError: true }, today);
    expect(loading.block?.reason).toMatch(/comprobando/);
    expect(failed.block?.reason).toMatch(/No se pudieron cargar/);
  });

  it("no ofrece una segunda devolución si ya se registró", () => {
    const result = returnActionAvailability({ ...booking, return_status: "returned" }, ready, today);
    expect(result.block?.code).toBe("booking_return_already_recorded");
  });

  it("elige devolución anticipada durante la renta y registro normal al vencer", () => {
    expect(returnActionAvailability(booking, ready, today)).toEqual({ block: null, isEarly: true });
    expect(returnActionAvailability({ ...booking, end_date: today }, ready, today))
      .toEqual({ block: null, isEarly: false });
  });
});
