import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { InvoiceCreditNotesCard } from "../InvoiceCreditNotesCard";

const mocks = vi.hoisted(() => ({ canWrite: false, credits: vi.fn(), stamp: vi.fn(), remove: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => mocks.canWrite }));
vi.mock("@/components/feedback/useConfirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("../../../hooks/creditNotes/useCreditNotes", () => ({
  useCreditNotesForInvoice: mocks.credits,
  useStampCreditNote: () => ({ mutate: mocks.stamp, isPending: false }),
  useDeleteCreditNote: () => ({ mutate: mocks.remove, isPending: false }),
}));
vi.mock("../../../hooks/usePayments", () => ({ usePayments: () => ({ data: [] }) }));
vi.mock("../../../hooks/invoices/cfdi/useRefreshCancellationStatus", () => ({
  useRefreshCreditNoteCancellationStatus: () => ({ mutate: mocks.refresh, isPending: false }),
}));
vi.mock("../CreateCreditNoteDialog", () => ({ CreateCreditNoteDialog: () => <div role="dialog">Nueva NC abierta</div> }));
vi.mock("../CancelCreditNoteDialog", () => ({ CancelCreditNoteDialog: () => <div role="dialog">Cancelar NC abierta</div> }));

const invoice = { id: "inv-usd", total: 1392, cfdi_status: "stamped", status: "sent", moneda: "USD", tipo_cambio: 18.4321 } as Tables<"invoices">;
const credit = { id: "cn-1", invoice_id: "inv-usd", credit_note_number: "NC-0001", total: 200,
  currency: "USD", motive: "discount", issued_at: "2026-09-27", line_items: [],
  cfdi_status: "stamped", status: "issued", cancellation_status: null };

beforeEach(() => {
  mocks.canWrite = false; vi.clearAllMocks();
  mocks.credits.mockReturnValue({ data: [credit] });
});
afterEach(cleanup);

describe("Notas de crédito — consulta y escritura", () => {
  it.each([
    { cfdi_status: "stamped", status: "issued", cancellation_status: null },
    { cfdi_status: "stamped", status: "issued", cancellation_status: "pending" },
    { cfdi_status: "pending", status: "draft", cancellation_status: null },
  ])("consulta no ofrece mutaciones en estado $cfdi_status / $cancellation_status", (state) => {
    mocks.credits.mockReturnValue({ data: [{ ...credit, ...state }] });
    render(<InvoiceCreditNotesCard invoice={invoice} />);
    expect(screen.getByText("NC-0001")).toBeInTheDocument();
    for (const name of ["Nueva NC", "Timbrar", "Cancelar nota de crédito", "Eliminar borrador de nota de crédito", "Actualizar estado SAT de nota de crédito"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    if (state.cfdi_status === "stamped") {
      expect(screen.getByRole("button", { name: "Descargar PDF SAT" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Descargar XML SAT" })).toBeInTheDocument();
    }
  });

  it("escritura puede crear una NC, su diálogo se oculta al perder permiso", () => {
    mocks.canWrite = true;
    const { rerender } = render(<InvoiceCreditNotesCard invoice={invoice} />);
    fireEvent.click(screen.getByRole("button", { name: "Nueva NC" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Nueva NC abierta");
    mocks.canWrite = false;
    rerender(<InvoiceCreditNotesCard invoice={invoice} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("escritura conserva timbrado y consulta SAT para sus estados correspondientes", () => {
    mocks.canWrite = true;
    mocks.credits.mockReturnValue({ data: [
      { ...credit, cfdi_status: "pending", status: "draft" },
      { ...credit, id: "cn-2", credit_note_number: "NC-0002", cancellation_status: "pending" },
    ] });
    render(<InvoiceCreditNotesCard invoice={invoice} />);
    fireEvent.click(screen.getByRole("button", { name: "Timbrar" }));
    expect(mocks.stamp).toHaveBeenCalledWith("cn-1");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar estado SAT de nota de crédito" }));
    expect(mocks.refresh).toHaveBeenCalledWith("cn-2");
  });

  it("una nota USD muestra su monto en dólares", () => {
    render(<InvoiceCreditNotesCard invoice={invoice} />);
    expect(screen.getByText(/(?:US\$|USD\s+)200\.00/)).toBeInTheDocument();
  });
});
