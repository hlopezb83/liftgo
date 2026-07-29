import type { ReactNode } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { BrowserRouter } from "react-router";
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

function renderActions(onSetStatus: (status: string) => void, quoteOverride: Tables<"quotes"> = quote) {
  render(
    <BrowserRouter>
      <QuoteDetailActions
        quote={quoteOverride}
        isSale={false}
        alreadyConverted={false}
        alreadyInvoiced={false}
        isConverting={false}
        canInvoice={false}
        onSetStatus={onSetStatus}
        onConvertClick={vi.fn()}
        onDelete={vi.fn()}
      />
    </BrowserRouter>,
  );
}

beforeEach(() => {
  useUserRoleMock.mockReturnValue({ data: "admin" });
});

describe("QuoteDetailActions (DB3-06)", () => {
  it("usa el estado 'rejected' del dominio de la base de datos al rechazar", () => {
    const onSetStatus = vi.fn();
    renderActions(onSetStatus);
    fireEvent.click(screen.getByRole("button", { name: /rechazar/i }));
    expect(onSetStatus).toHaveBeenCalledWith("rejected");
  });

  it("acepta solo desde 'sent' y con el estado 'accepted'", () => {
    const onSetStatus = vi.fn();
    renderActions(onSetStatus);
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
    expect(onSetStatus).toHaveBeenCalledWith("accepted");
  });
});

describe("QuoteDetailActions - Cancelar cotización (FE4-03 / N-R4-C)", () => {
  it("muestra el botón para admin en una cotización aceptada", () => {
    useUserRoleMock.mockReturnValue({ data: "admin" });
    renderActions(vi.fn(), acceptedQuote);
    expect(screen.getByRole("button", { name: /cancelar cotización/i })).toBeInTheDocument();
  });

  it("muestra el botón para administrativo en una cotización aceptada", () => {
    useUserRoleMock.mockReturnValue({ data: "administrativo" });
    renderActions(vi.fn(), acceptedQuote);
    expect(screen.getByRole("button", { name: /cancelar cotización/i })).toBeInTheDocument();
  });

  it("oculta el botón para otros roles", () => {
    useUserRoleMock.mockReturnValue({ data: "ventas" });
    renderActions(vi.fn(), acceptedQuote);
    expect(screen.queryByRole("button", { name: /cancelar cotización/i })).not.toBeInTheDocument();
  });

  it("no aparece si la cotización no está en 'accepted'", () => {
    useUserRoleMock.mockReturnValue({ data: "admin" });
    renderActions(vi.fn());
    expect(screen.queryByRole("button", { name: /cancelar cotización/i })).not.toBeInTheDocument();
  });

  it("al confirmar, invoca onSetStatus con 'cancelled'", () => {
    useUserRoleMock.mockReturnValue({ data: "admin" });
    const onSetStatus = vi.fn();
    renderActions(onSetStatus, acceptedQuote);
    fireEvent.click(screen.getByRole("button", { name: /cancelar cotización/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar cotización" }));
    expect(onSetStatus).toHaveBeenCalledWith("cancelled");
  });
});
