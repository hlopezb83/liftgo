import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReportTransferDialog } from "../ReportTransferDialog";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../../hooks/usePortalExtras", () => ({ useCreatePaymentIntent: () => ({ mutate, isPending: false }) }));
beforeEach(() => vi.clearAllMocks());
const props = { open: true, onOpenChange: vi.fn(), invoiceId: "invoice-a", customerId: "customer-a", balance: 1160 };

it("preserves bank, tracking and proof while validating a dirty amount against the refreshed balance", async () => {
  const view = render(<ReportTransferDialog {...props} />);
  fireEvent.change(screen.getByLabelText("Banco emisor"), { target: { value: "Banco QA" } });
  fireEvent.change(screen.getByLabelText("Clave de rastreo SPEI (opcional)"), { target: { value: "QA-123" } });
  const proof = new File(["synthetic receipt"], "recibo.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Comprobante (PDF o imagen, opcional)"), { target: { files: [proof] } });
  view.rerender(<ReportTransferDialog {...props} balance={1060} pendingInReview={100} />);
  expect(screen.getByLabelText("Banco emisor")).toHaveValue("Banco QA");
  expect(screen.getByLabelText("Clave de rastreo SPEI (opcional)")).toHaveValue("QA-123");
  expect((screen.getByLabelText("Comprobante (PDF o imagen, opcional)") as HTMLInputElement).files?.[0]).toBe(proof);
  await screen.findByText(/El monto no puede superar el saldo reportable/);
  fireEvent.click(screen.getByRole("button", { name: "Enviar reporte" }));
  await waitFor(() => expect(screen.getByText(/El monto no puede superar el saldo reportable/)).toBeInTheDocument());
  expect(mutate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/Monto/), { target: { value: "1060" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar reporte" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
    amount: 1060, sender_bank: "Banco QA", tracking_key: "QA-123", proof_file: proof,
  }), expect.any(Object)));
});

it("updates a pristine amount and starts fresh when the invoice changes", async () => {
  const view = render(<ReportTransferDialog {...props} />);
  view.rerender(<ReportTransferDialog {...props} balance={1060} />);
  fireEvent.click(screen.getByRole("button", { name: "Enviar reporte" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ amount: 1060 }), expect.any(Object)));
  fireEvent.change(screen.getByLabelText("Banco emisor"), { target: { value: "Otra captura" } });
  view.rerender(<ReportTransferDialog {...props} invoiceId="invoice-b" balance={500} />);
  expect(screen.getByLabelText("Banco emisor")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Enviar reporte" }));
  await waitFor(() => expect(mutate).toHaveBeenLastCalledWith(expect.objectContaining({ invoice_id: "invoice-b", amount: 500, proof_file: null }), expect.any(Object)));
});

it("treats an attachment alone as a draft even when the balance changes immediately", async () => {
  const view = render(<ReportTransferDialog {...props} />);
  const proof = new File(["synthetic receipt"], "solo-archivo.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Comprobante (PDF o imagen, opcional)"), { target: { files: [proof] } });
  view.rerender(<ReportTransferDialog {...props} balance={2000} />);
  fireEvent.click(screen.getByRole("button", { name: "Enviar reporte" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ amount: 1160, proof_file: proof }), expect.any(Object)));
  view.rerender(<ReportTransferDialog {...props} invoiceId="invoice-b" balance={500} />);
  expect((screen.getByLabelText("Comprobante (PDF o imagen, opcional)") as HTMLInputElement).files?.length).toBe(0);
});
