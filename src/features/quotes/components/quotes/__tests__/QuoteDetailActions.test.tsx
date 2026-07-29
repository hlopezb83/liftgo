import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { describe, it, expect, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { QuoteDetailActions } from "../QuoteDetailActions";

vi.mock("@/layouts/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../QuotePDFButton", () => ({
  QuotePDFButton: () => <button type="button">PDF</button>,
}));

const quote = {
  id: "q-1",
  quote_number: "COT-0001",
  status: "sent",
  quote_type: "rental",
  valid_until: "2099-12-31",
  accepted_at: null,
} as unknown as Tables<"quotes">;

function renderActions(onSetStatus: (status: string) => void) {
  render(
    <BrowserRouter>
      <QuoteDetailActions
        quote={quote}
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
