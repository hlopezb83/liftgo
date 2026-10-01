import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

const { confirm, download } = vi.hoisted(() => ({ confirm: vi.fn(), download: vi.fn() }));
let batch = {
  id: "12345678-batch", created_at: "2026-10-01T12:00:00Z", bill_count: 1,
  notes: null, cancelled_at: null as string | null, payment_count: 0,
  totals_by_currency: [{ currency: "MXN", total: 50 }, { currency: "USD", total: 20 }],
};
let pageError = false;
const cancelCalls: string[] = [];
vi.mock("@/components/feedback/useConfirm", () => ({ useConfirm: () => confirm }));
vi.mock("../../hooks/useDownloadPaymentBatch", () => ({ useDownloadPaymentBatch: () => ({ mutate: download, isPending: false }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ rpcResolvers: {
    get_supplier_payment_batches_page: () => pageError
      ? { data: null, error: { message: "Connection failed" } }
      : { data: { items: [batch], total_count: 1 }, error: null },
    cancel_supplier_payment_batch: () => {
      cancelCalls.push(batch.id);
      batch = { ...batch, cancelled_at: "2026-10-01T13:00:00Z" };
      return { data: null, error: null };
    },
  } }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
import { PaymentBatchesDialog } from "../PaymentBatchesDialog";

beforeEach(() => {
  batch = { ...batch, cancelled_at: null, payment_count: 0 };
  pageError = false;
  confirm.mockReset().mockResolvedValue(true);
  download.mockReset();
  cancelCalls.length = 0;
});
function show() {
  const { Wrapper } = createQueryWrapper();
  return render(<Wrapper><PaymentBatchesDialog open onOpenChange={vi.fn()} /></Wrapper>);
}

describe("existing payment batch recovery", () => {
  it("downloads an existing batch without creating another and presents currencies separately", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Descargar original" }));
    expect(download).toHaveBeenCalledWith("12345678-batch");
    expect(screen.getByText(/MXN/)).toBeInTheDocument();
    expect(screen.getByText(/USD/)).toBeInTheDocument();
    expect(cancelCalls).toEqual([]);
  });
  it("requires confirmation and preserves the cancelled history row", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar lote" }));
    await waitFor(() => expect(cancelCalls).toEqual(["12345678-batch"]));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }));
    expect(await screen.findByText("Cancelado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descargar original" })).not.toBeInTheDocument();
  });
  it("does not cancel when the user declines confirmation", async () => {
    confirm.mockResolvedValue(false);
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar lote" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(cancelCalls).toEqual([]);
  });
  it("disables cancellation for a batch with payments and hides payment actions for cancelled batches", async () => {
    batch.payment_count = 1;
    const first = show();
    expect(await screen.findByRole("button", { name: "Cancelar lote" })).toBeDisabled();
    first.unmount();
    batch.cancelled_at = "2026-10-01T13:00:00Z";
    show();
    expect(await screen.findByText("Cancelado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar lote" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descargar original" })).not.toBeInTheDocument();
  });
  it("renders a recoverable query error rather than claiming history is empty", async () => {
    pageError = true;
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar");
    expect(screen.queryByText("Sin lotes de pago registrados.")).not.toBeInTheDocument();
  });
});

