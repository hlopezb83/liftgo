import type { ReactNode } from "react";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { TestRouter } from "@/test/router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import type { AppRole } from "@/features/users";
import { QuoteDetailActions } from "../QuoteDetailActions";

const useUserRoleMock = vi.fn<() => { data: AppRole | null }>();

vi.mock("@/layouts/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../QuotePDFButton", () => ({
  QuotePDFButton: () => <button type="button">PDF</button>,
}));
vi.mock("@/features/users", () => ({
  useUserRole: () => useUserRoleMock(),
}));

const quote = {
  id: "q-1",
  quote_number: "COT-0001",
  status: "sent",
  quote_type: "rental",
  valid_until: "2099-12-31",
  accepted_at: null,
} as unknown as Tables<"quotes">;

const acceptedQuote = { ...quote, status: "accepted" } as unknown as Tables<"quotes">;

function renderActions(
  onSetStatus: (status: string) => void,
  quoteOverride: Tables<"quotes"> = quote,
  extra: { alreadyConverted?: boolean; linkedBookingId?: string | null } = {},
) {
  render(
    <TestRouter>
      <QuoteDetailActions
        quote={quoteOverride}
        isSale={false}
        alreadyConverted={extra.alreadyConverted ?? false}
        linkedBookingId={extra.linkedBookingId}
        alreadyInvoiced={false}
        isConverting={false}
        canInvoice={false}
        onSetStatus={onSetStatus}
        onConvertClick={vi.fn()}
        onDelete={vi.fn()}
      />
    </TestRouter>,
  );
}

beforeEach(() => {
  useUserRoleMock.mockReturnValue({ data: "admin" });
});

describe("QuoteDetailActions (DB3-06)", () => {
  it("usa el estado 'rejected' del dominio de la base de datos al rechazar, con motivo (R8-FE-15)", async () => {
    const onSetStatus = vi.fn();
    renderActions(onSetStatus);
    fireEvent.click(await screen.findByRole("button", { name: /rechazar/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/motivo del rechazo/i), {
      target: { value: "El cliente encontró mejor precio" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /confirmar rechazo/i }));
    await waitFor(() =>
      expect(onSetStatus).toHaveBeenCalledWith("rejected", { rejectionReason: "El cliente encontró mejor precio" }),
    );
  });

  it("acepta solo desde 'sent' y con el estado 'accepted'", async () => {
    const onSetStatus = vi.fn();
    renderActions(onSetStatus);
    fireEvent.click(await screen.findByRole("button", { name: /aceptar/i }));
    expect(onSetStatus).toHaveBeenCalledWith("accepted");
  });
});

describe("QuoteDetailActions - Cancelar cotización (FE4-03 / N-R4-C)", () => {
  it("muestra el botón para admin en una cotización aceptada", async () => {
    useUserRoleMock.mockReturnValue({ data: "admin" });
    renderActions(vi.fn(), acceptedQuote);
    expect(await screen.findByRole("button", { name: /cancelar cotización/i })).toBeInTheDocument();
  });

  it("muestra el botón para administrativo en una cotización aceptada", async () => {
    useUserRoleMock.mockReturnValue({ data: "administrativo" });
    renderActions(vi.fn(), acceptedQuote);
    expect(await screen.findByRole("button", { name: /cancelar cotización/i })).toBeInTheDocument();
  });

  it("oculta el botón para otros roles", async () => {
    useUserRoleMock.mockReturnValue({ data: "ventas" });
    renderActions(vi.fn(), acceptedQuote);
    await screen.findByRole("button", { name: /pdf/i });
    expect(screen.queryByRole("button", { name: /cancelar cotización/i })).not.toBeInTheDocument();
  });

  it("no aparece si la cotización no está en 'accepted'", async () => {
    useUserRoleMock.mockReturnValue({ data: "admin" });
    renderActions(vi.fn());
    await screen.findByRole("button", { name: /aceptar/i });
    expect(screen.queryByRole("button", { name: /cancelar cotización/i })).not.toBeInTheDocument();
  });

  it("al confirmar, invoca onSetStatus con 'cancelled'", async () => {
    useUserRoleMock.mockReturnValue({ data: "admin" });
    const onSetStatus = vi.fn();
    renderActions(onSetStatus, acceptedQuote);
    fireEvent.click(await screen.findByRole("button", { name: /cancelar cotización/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar cotización" }));
    expect(onSetStatus).toHaveBeenCalledWith("cancelled");
  });
});

describe("QuoteDetailActions · bloqueos explicables (lote 3)", () => {
  it("mantiene 'Aceptar' visible pero deshabilitada cuando la cotización venció", async () => {
    const expired = { ...quote, valid_until: "2020-01-01" } as unknown as Tables<"quotes">;
    const onSetStatus = vi.fn();
    renderActions(onSetStatus, expired);
    const accept = await screen.findByRole("button", { name: /aceptar/i });
    expect(accept).toBeDisabled();
    fireEvent.click(accept);
    expect(onSetStatus).not.toHaveBeenCalled();
  });

  // V26-08: la acción útil es "Ver reserva"; la CTA deshabilitada
  // "Ya convertida a Reserva" se retiró por redundante con el badge de estado.
  it("ofrece 'Ver reserva' cuando la cotización ya fue convertida", async () => {
    renderActions(vi.fn(), quote, { alreadyConverted: true, linkedBookingId: "b-1" });
    const ver = await screen.findByRole("button", { name: /ver reserva/i });
    expect(ver).toBeEnabled();
    expect(screen.queryByRole("button", { name: /ya convertida a reserva/i })).toBeNull();
  });

  it("sin reserva ligada conserva el aviso de estado convertida", async () => {
    renderActions(vi.fn(), quote, { alreadyConverted: true, linkedBookingId: null });
    expect(await screen.findByText(/ya convertida a reserva/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /convertir a reserva/i })).toBeNull();
  });
});
