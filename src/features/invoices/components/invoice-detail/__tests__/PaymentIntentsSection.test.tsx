import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminPaymentIntentRow } from "../../../lib/paymentIntentsQueryKeys";
import { PaymentIntentsSection } from "../PaymentIntentsSection";

const mocks = vi.hoisted(() => ({ load: vi.fn(), review: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => true }));
vi.mock("@/features/invoices/hooks/paymentIntents", () => ({
  useAdminPaymentIntents: (invoiceId: string) => useQuery<AdminPaymentIntentRow[]>({
    queryKey: ["payment-intents-test", invoiceId], queryFn: mocks.load, retry: false,
  }),
  useReviewPaymentIntent: () => ({ mutate: mocks.review, isPending: false }),
}));

const intent: AdminPaymentIntentRow = {
  id: "intent-1", invoice_id: "invoice-1", customer_id: "customer-1", amount: 500,
  transfer_date: "2026-11-01", tracking_key: "QA-RASTREO-123", status: "pending_review",
  sender_bank: "Banco QA", sender_last4: "1234", proof_url: null, review_notes: null,
};
const title = "Intentos de pago reportados por el cliente";
const errorTitle = "No se pudo cargar el listado de reportes de pago";

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><PaymentIntentsSection invoiceId="invoice-1" /></QueryClientProvider>);
  return client;
}

beforeEach(() => vi.resetAllMocks());

describe("reportes de pago: estado de consulta", () => {
  it("muestra carga y error, permite reintentar y recupera los reportes", async () => {
    let rejectInitial!: (reason: Error) => void;
    let resolveRetry!: (rows: AdminPaymentIntentRow[]) => void;
    mocks.load.mockReturnValueOnce(new Promise((_, reject) => { rejectInitial = reject; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }));
    renderSection();
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando reportes de pago");
    await act(async () => rejectInitial(new Error("Fallo de lectura ficticio")));
    expect(await screen.findByText(errorTitle)).toBeInTheDocument();
    expect(screen.queryByText("Sin intentos de pago")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Sin intentos de pago")).not.toBeInTheDocument();
    await act(async () => resolveRetry([intent]));
    expect(await screen.findByText("QA-RASTREO-123")).toBeInTheDocument();
    expect(screen.queryByText(errorTitle)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(mocks.review).toHaveBeenCalledWith({ intentId: intent.id, action: "approve" });
  });

  it("oculta la sección sólo tras una respuesta vacía válida", async () => {
    mocks.load.mockResolvedValue([]);
    renderSection();
    expect(screen.getByText(title)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument());
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("avisa si falla una actualización aunque haya reportes en caché", async () => {
    mocks.load.mockResolvedValueOnce([intent]).mockRejectedValueOnce(new Error("Fallo al actualizar"));
    const client = renderSection();
    expect(await screen.findByText("QA-RASTREO-123")).toBeInTheDocument();
    await act(async () => { await client.invalidateQueries({ queryKey: ["payment-intents-test"] }); });
    expect(await screen.findByText(errorTitle)).toBeInTheDocument();
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument();
    expect(mocks.review).not.toHaveBeenCalled();
  });
});
