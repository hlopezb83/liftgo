import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminPaymentIntentRow } from "../../../lib/paymentIntentsQueryKeys";
import { PaymentIntentsSection } from "../PaymentIntentsSection";

const mocks = vi.hoisted(() => ({ load: vi.fn(), review: vi.fn(), canWrite: true }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => mocks.canWrite }));
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
  const element = (invoiceId: string) => <QueryClientProvider client={client}><PaymentIntentsSection invoiceId={invoiceId} /></QueryClientProvider>;
  const { rerender } = render(element("invoice-1"));
  return { client, renderInvoice: (invoiceId: string) => rerender(element(invoiceId)) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.canWrite = true;
});

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
    fireEvent.click(screen.getByRole("button", { name: /^Aprobar reporte.*QA-RASTREO-123/ }));
    expect(mocks.review).not.toHaveBeenCalled();
    const confirmation = screen.getByRole("alertdialog", { name: "Aprobar reporte de pago" });
    expect(confirmation).toHaveAccessibleDescription(/Monto:.*500.*Fecha de transferencia:.*Rastreo: QA-RASTREO-123/);
    fireEvent.click(within(confirmation).getByRole("button", { name: "Confirmar aprobación" }));
    expect(mocks.review).toHaveBeenCalledExactlyOnceWith({ intentId: intent.id, action: "approve" });
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
    const { client } = renderSection();
    expect(await screen.findByText("QA-RASTREO-123")).toBeInTheDocument();
    await act(async () => { await client.invalidateQueries({ queryKey: ["payment-intents-test"] }); });
    expect(await screen.findByText(errorTitle)).toBeInTheDocument();
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^Aprobar reporte/ })).not.toBeInTheDocument();
    expect(mocks.review).not.toHaveBeenCalled();
  });
});

describe("confirmación de aprobación", () => {
  const key = ["payment-intents-test", "invoice-1"];
  const openApproval = async () => {
    const action = await screen.findByRole("button", { name: /^Aprobar reporte.*QA-RASTREO-123/ });
    action.focus();
    fireEvent.click(action);
    return screen.getByRole("alertdialog", { name: "Aprobar reporte de pago" });
  };

  it.each(["Escape", "Cancelar"])("devuelve el foco al botón de la fila al cerrar con %s", async (method) => {
    mocks.load.mockResolvedValue([intent]);
    renderSection();
    const dialog = await openApproval();
    if (method === "Escape") fireEvent.keyDown(dialog, { key: "Escape" });
    else fireEvent.click(within(dialog).getByRole("button", { name: method }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: /^Aprobar reporte/ })).toHaveFocus());
    expect(mocks.review).not.toHaveBeenCalled();
  });

  it("no repone la confirmación descartada por un error al recuperar los reportes", async () => {
    mocks.load.mockResolvedValueOnce([intent]).mockRejectedValueOnce(new Error("Fallo al actualizar")).mockResolvedValueOnce([intent]);
    const { client } = renderSection();
    await openApproval();
    await act(async () => { await client.invalidateQueries({ queryKey: key }); });
    await screen.findByText(errorTitle);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    const section = screen.getByRole("region", { name: "Reportes de pago del cliente" });
    await waitFor(() => expect(section).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText(intent.tracking_key!);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.review).not.toHaveBeenCalled();
    expect(await openApproval()).toBeInTheDocument();
  });

  it.each([["sale de revisión", [{ ...intent, status: "approved" }]], ["desaparece", []]])(
    "descarta selección y enfoca la sección si el reporte %s",
    async (_case, nextRows) => {
      mocks.load.mockResolvedValue([intent]);
      const { client } = renderSection();
      await openApproval();
      act(() => { client.setQueryData(key, nextRows); });
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      await waitFor(() => expect(screen.getByRole("region", { name: "Reportes de pago del cliente" })).toHaveFocus());
      act(() => { client.setQueryData(key, [intent]); });
      await screen.findByRole("button", { name: /^Aprobar reporte/ });
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(mocks.review).not.toHaveBeenCalled();
    },
  );

  it("descarta la confirmación al perder acceso y no la reabre si el permiso vuelve", async () => {
    mocks.load.mockResolvedValue([intent]);
    const { renderInvoice } = renderSection();
    await openApproval();
    mocks.canWrite = false;
    renderInvoice("invoice-1");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("region", { name: "Reportes de pago del cliente" })).toHaveFocus());
    mocks.canWrite = true;
    renderInvoice("invoice-1");
    await screen.findByRole("button", { name: /^Aprobar reporte/ });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.review).not.toHaveBeenCalled();
  });

  it("descarta la confirmación al navegar a otra factura y volver", async () => {
    mocks.load.mockImplementation(({ queryKey }: { queryKey: [string, string] }) =>
      Promise.resolve([{ ...intent, invoice_id: queryKey[1] }]),
    );
    const { renderInvoice } = renderSection();
    await openApproval();
    renderInvoice("invoice-2");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await screen.findByRole("button", { name: /^Aprobar reporte/ });
    renderInvoice("invoice-1");
    await screen.findByRole("button", { name: /^Aprobar reporte/ });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.review).not.toHaveBeenCalled();
  });
});
