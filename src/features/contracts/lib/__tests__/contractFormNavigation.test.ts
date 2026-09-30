import { describe, expect, it } from "vitest";
import { contractFormReturnTo } from "../contractFormNavigation";

const bookingId = "7b5fb45a-5677-4e22-a91b-ba6f6840f872";
const contractId = "a25b2a4c-4721-4563-adc2-7e494de40d96";

describe("contractFormReturnTo", () => {
  it("vuelve a la reserva al cancelar un contrato nuevo vinculado", () => {
    expect(contractFormReturnTo(undefined, bookingId)).toBe(`/bookings/${bookingId}`);
  });
  it("vuelve al contrato al cancelar una edición", () => {
    expect(contractFormReturnTo(contractId, bookingId)).toBe(`/contracts/${contractId}`);
  });
  it.each([null, "", "https://example.com", "../../settings", "no-es-uuid"])(
    "vuelve a la lista para un origen inválido: %s", (source) => {
      expect(contractFormReturnTo(undefined, source)).toBe("/contracts");
    },
  );
});
