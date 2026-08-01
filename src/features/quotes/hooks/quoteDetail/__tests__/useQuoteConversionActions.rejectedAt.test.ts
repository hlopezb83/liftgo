import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * R9-P2-01: al rechazar una cotización se sella `rejected_at`. Antes quedaba
 * NULL y el rechazo no era trazable en el tiempo (ni en historial ni reportes).
 */
const mutate = vi.fn();

vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock("../../quotes/useQuotes", () => ({
  useUpdateQuote: () => ({ mutate }),
  useDeleteQuote: () => ({ mutate: vi.fn() }),
}));
vi.mock("../useQuoteBookingCreator", () => ({
  useQuoteBookingCreator: () => ({ createBookingsFor: vi.fn(), convertLegacy: vi.fn() }),
}));
vi.mock("../useQuoteDetailData", () => ({ isPublicoGeneral: () => false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: { id: "u-1" } } }) } },
}));

import { useQuoteConversionActions } from "../useQuoteConversionActions";

const data = { quote: { id: "q-1", status: "sent" }, isModelBasedQuote: false };
const state = {};

function setup() {
  const { result } = renderHook(() =>
    useQuoteConversionActions("q-1", data as never, state as never),
  );
  return result;
}

describe("useQuoteConversionActions.setStatus", () => {
  beforeEach(() => mutate.mockClear());

  it("sella rejected_at al rechazar", async () => {
    const result = setup();
    await result.current.setStatus("rejected");
    const payload = mutate.mock.calls[0][0];
    expect(payload.status).toBe("rejected");
    expect(typeof payload.rejected_at).toBe("string");
    expect(Number.isNaN(Date.parse(payload.rejected_at))).toBe(false);
  });

  it("persiste el motivo de rechazo junto con la fecha", async () => {
    const result = setup();
    await result.current.setStatus("rejected", { rejectionReason: "Precio alto" });
    const payload = mutate.mock.calls[0][0];
    expect(payload.rejection_reason).toBe("Precio alto");
    expect(payload.rejected_at).toBeTruthy();
  });

  it("no agrega rejected_at cuando el estatus no es rechazado", async () => {
    const result = setup();
    await result.current.setStatus("sent");
    expect(mutate.mock.calls[0][0].rejected_at).toBeUndefined();
  });

  it("al aceptar sella accepted_at y el usuario, no rejected_at", async () => {
    const result = setup();
    await result.current.setStatus("accepted");
    const payload = mutate.mock.calls[0][0];
    expect(payload.accepted_at).toBeTruthy();
    expect(payload.accepted_by_user_id).toBe("u-1");
    expect(payload.rejected_at).toBeUndefined();
  });
});
