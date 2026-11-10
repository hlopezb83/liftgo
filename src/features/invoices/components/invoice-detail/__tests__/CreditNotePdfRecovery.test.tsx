import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { InvoiceCreditNotesCard } from "../InvoiceCreditNotesCard";

const mocks = vi.hoisted(() => ({
  credits: vi.fn(),
  refetch: vi.fn(),
  download: vi.fn(),
  error: vi.fn(),
  stamp: vi.fn(),
}));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
vi.mock("@/components/feedback/useConfirm", () => ({
  useConfirm: () => vi.fn(),
}));
vi.mock("../../../hooks/creditNotes/useCreditNotes", () => ({
  useCreditNotesForInvoice: mocks.credits,
  useStampCreditNote: () => ({ mutate: mocks.stamp, isPending: false }),
  useDeleteCreditNote: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../hooks/usePayments", () => ({
  usePayments: () => ({ data: [] }),
}));
vi.mock("../../../hooks/invoices/cfdi/useRefreshCancellationStatus", () => ({
  useRefreshCreditNoteCancellationStatus: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));
vi.mock("../../../lib/downloadCfdiBlob", () => ({
  downloadCfdiBlob: mocks.download,
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: mocks.error }));
vi.mock("../CreateCreditNoteDialog", () => ({
  CreateCreditNoteDialog: () => null,
}));
vi.mock("../CancelCreditNoteDialog", () => ({
  CancelCreditNoteDialog: () => null,
}));
const invoice = {
  id: "inv-1",
  total: 116,
  cfdi_status: "stamped",
  status: "sent",
  moneda: "MXN",
} as Tables<"invoices">;
const note = {
  id: "cn-1",
  invoice_id: "inv-1",
  credit_note_number: "NC-0001",
  total: 20,
  currency: "MXN",
  motive: "discount",
  issued_at: "2026-11-01",
  line_items: [],
  cfdi_status: "stamped",
  status: "stamped",
  cancellation_status: "none",
  cfdi_pdf_url: null as string | null,
};
function data(row = note) {
  mocks.credits.mockReturnValue({ data: [row], refetch: mocks.refetch });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.download.mockResolvedValue(undefined);
  data();
});
afterEach(cleanup);

describe("NC missing PDF is a document condition, not a stamping failure", () => {
  it("keeps stamped badge and read-only download, explains recovery without offering stamping", () => {
    render(<InvoiceCreditNotesCard invoice={invoice} />);
    expect(screen.getByText("Timbrada")).toBeInTheDocument();
    expect(
      screen.getByText(/PDF pendiente de recuperación/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Descargar PDF SAT" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Timbrar" }),
    ).not.toBeInTheDocument();
  });
  it.each(["pdf", "xml"])(
    "refreshes NC query only after successful %s download",
    async (format) => {
      render(<InvoiceCreditNotesCard invoice={invoice} />);
      fireEvent.click(
        screen.getByRole("button", {
          name: `Descargar ${format.toUpperCase()} SAT`,
        }),
      );
      await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1));
      expect(mocks.download).toHaveBeenCalledWith(
        { credit_note_id: "cn-1" },
        format,
        `NC-0001.${format}`,
      );
      expect(mocks.stamp).not.toHaveBeenCalled();
    },
  );
  it("keeps pending notice and reports failed download without refetch or stamping", async () => {
    mocks.download.mockRejectedValue(new Error("unavailable"));
    render(<InvoiceCreditNotesCard invoice={invoice} />);
    fireEvent.click(screen.getByRole("button", { name: "Descargar PDF SAT" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(mocks.stamp).not.toHaveBeenCalled();
    expect(
      screen.getByText(/PDF pendiente de recuperación/),
    ).toBeInTheDocument();
  });
  it("removes notice when refreshed data contains the recovered PDF", () => {
    const { rerender } = render(<InvoiceCreditNotesCard invoice={invoice} />);
    data({ ...note, cfdi_pdf_url: "org/credit-notes/cn-1/uuid.pdf" });
    rerender(<InvoiceCreditNotesCard invoice={invoice} />);
    expect(
      screen.queryByText(/PDF pendiente de recuperación/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Timbrada")).toBeInTheDocument();
  });
  it.each(["pending", "cancelled", "error"])(
    "does not label a %s document as pending PDF recovery",
    (cfdi_status) => {
      data({ ...note, cfdi_status });
      render(<InvoiceCreditNotesCard invoice={invoice} />);
      expect(
        screen.queryByText(/PDF pendiente de recuperación/),
      ).not.toBeInTheDocument();
    },
  );
});
