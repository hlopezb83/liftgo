import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingDraftNotice } from "../BookingDraftNotice";
import type { useBookingDraft } from "../../../hooks/bookingForm/useBookingDraft";

const h = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock("@/components/feedback/useConfirm", () => ({ useConfirm: () => h.confirm }));
function draft(overrides: Partial<ReturnType<typeof useBookingDraft>> = {}): ReturnType<typeof useBookingDraft> {
  return { status: "ready", candidate: null, expiresAt: null, hasChanges: false, restore: vi.fn(), discard: vi.fn(), reload: vi.fn(), captureCompletion: vi.fn(), canSubmit: vi.fn(), submitBlocked: false, ...overrides };
}
beforeEach(() => { vi.clearAllMocks(); h.confirm.mockResolvedValue(true); });

describe("BookingDraftNotice", () => {
  it("makes privacy, 7-day lifetime and no reservation creation explicit", () => {
    render(<BookingDraftNotice draft={draft()} busy={false} />);
    expect(screen.getByText(/máximo de 7 días/)).toBeVisible();
    expect(screen.getByText(/nombre libre y el contacto no se guardan/)).toBeVisible();
    expect(screen.getByText(/No se crea ni se aparta ningún equipo/)).toBeVisible();
  });
  it("offers explicit restore/discard without restoring on render; disables actions while creating", () => {
    const state = draft({ candidate: { version: 1, id: "draft", revision: "revision", scope: "scope", epoch: "epoch", createdAt: Date.now(), updatedAt: Date.now(), expiresAt: Date.now() + 1000, values: { forklift_id: "", customer_id: "", recurring_billing: false } } });
    const { rerender } = render(<BookingDraftNotice draft={state} busy={true} />);
    expect(state.restore).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Restaurar borrador" })).toBeDisabled();
    rerender(<BookingDraftNotice draft={state} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar borrador" }));
    expect(state.restore).toHaveBeenCalledTimes(1);
  });
  it("canceling discard preserves entered fields, then confirmation discards only explicitly", async () => {
    const state = draft({ hasChanges: true, status: "saved" });
    h.confirm.mockResolvedValueOnce(false);
    render(<BookingDraftNotice draft={state} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador y captura" }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    expect(state.discard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador y captura" }));
    await waitFor(() => expect(state.discard).toHaveBeenCalledTimes(1));
  });
  it("never claims the local copy was removed if the browser rejected cleanup", () => {
    render(<BookingDraftNotice draft={draft({ status: "created-unavailable" })} busy={false} />);
    expect(screen.getByText(/navegador impidió limpiar/)).toBeVisible();
    expect(screen.queryByText("Reserva creada; borrador eliminado")).not.toBeInTheDocument();
  });
});
