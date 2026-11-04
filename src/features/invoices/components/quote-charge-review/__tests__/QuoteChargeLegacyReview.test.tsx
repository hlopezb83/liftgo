import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LegacyChargeReview } from "../../../lib/quoteChargeLegacyReview";
import { parseLegacyChargeReview } from "../../../lib/quoteChargeLegacyReview";
import { QuoteChargeLegacyReview } from "../QuoteChargeLegacyReview";

const mocks = vi.hoisted(() => ({
  role: "admin",
  query: {
    data: undefined as LegacyChargeReview | undefined,
    isPending: false, isError: false, isFetching: false,
    error: null as unknown,
    refetch: vi.fn().mockResolvedValue(undefined),
    reconcile: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
    reverse: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
  },
  useReview: vi.fn(),
}));
vi.mock("@/features/users", () => ({ useUserRole: () => ({ data: mocks.role }) }));
vi.mock("../../../hooks/invoices/useQuoteChargeLegacyReview", () => ({ useQuoteChargeLegacyReview: () => { mocks.useReview(); return mocks.query; } }));
vi.mock("@/lib/router-compat-ui", () => ({ Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a> }));

const quoteId = "10700000-0000-4000-8000-000000000001";
const lineId = "10700000-0000-4000-8000-000000000002";
function fixture(): LegacyChargeReview {
  return {
    complete: true, quote_id: quoteId, quote_number: "COT-QA", can_reconcile: true,
    charges: [{ quote_line_id: lineId, line: { description: "Logística", quantity: 2, unit_price: 100 }, quoted_quantity: 2, consumed_quantity: 0, remaining_quantity: 2 }],
    invoices: [{ invoice_id: "10700000-0000-4000-8000-000000000003", invoice_number: "FAC-QA", status: "paid", cfdi_status: "stamped", cancellation_status: "pending", active: true, reviewable: true, empty_positive: false,
      lines: [{ line_index: 0, line: { description: "Entrega histórica", quantity: 1, unit_price: 100, total: 100 }, line_hash: "a".repeat(64), pending: true, reviewable: true, blocked_reason: null, review: null, history: [] }],
    }],
  };
}
function mount() {
  return render(<QuoteChargeLegacyReview quoteId={quoteId} quoteNumber="COT-QA" />);
}
async function openForm() {
  fireEvent.click(screen.getByRole("button", { name: "Revisar historial de cargos" }));
  fireEvent.click(await screen.findByRole("button", { name: "Revisar partida" }));
}
function completeForm() {
  fireEvent.change(screen.getByLabelText("Clasificación revisada"), { target: { value: "charge" } });
  fireEvent.change(screen.getByLabelText("Cargo de COT-QA"), { target: { value: lineId } });
  fireEvent.change(screen.getByLabelText("Cantidad histórica a vincular"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Motivo obligatorio"), { target: { value: "Evidencia comprobada" } });
  fireEvent.change(screen.getByLabelText("Evidencia revisada obligatoria"), { target: { value: "Documento QA de entrega" } });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "admin";
  Object.assign(mocks.query, { data: fixture(), isPending: false, isError: false, isFetching: false, error: null });
  mocks.query.reconcile.isPending = false;
  mocks.query.reverse.isPending = false;
  mocks.query.reconcile.mutateAsync.mockResolvedValue(undefined);
  mocks.query.reverse.mutateAsync.mockResolvedValue(undefined);
});

describe("historical quote charge review", () => {
  it("hides the entry and does not load historical data for sales or portal roles", () => {
    for (const role of ["ventas", "customer", "dispatcher"]) {
      mocks.role = role;
      const view = mount();
      expect(screen.queryByRole("button", { name: "Revisar historial de cargos" })).not.toBeInTheDocument();
      view.unmount();
    }
    expect(mocks.useReview).not.toHaveBeenCalled();
  });

  it("shows causing invoice and cancellation status to auditor without write actions", async () => {
    mocks.role = "auditor";
    mocks.query.data = { ...fixture(), can_reconcile: false };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revisar historial de cargos" }));
    expect(await screen.findByRole("link", { name: "FAC-QA" })).toHaveAttribute("href", expect.stringContaining("/invoices/"));
    expect(screen.getByText(/Cancelación: pending/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revisar partida" })).not.toBeInTheDocument();
  });

  it("requires explicit classification, positive finite quantity, reason and evidence without prefilling a match", async () => {
    mount();
    await openForm();
    const save = screen.getByRole("button", { name: "Guardar conciliación" });
    expect(save).toBeDisabled();
    expect(screen.getByLabelText("Clasificación revisada")).toHaveValue("");
    completeForm();
    expect(save).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Cantidad histórica a vincular"), { target: { value: "0" } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Cantidad histórica a vincular"), { target: { value: "-1" } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Cantidad histórica a vincular"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Motivo obligatorio"), { target: { value: "a" } });
    expect(save).toBeDisabled();
    expect(mocks.query.reconcile.mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps the same request key and original reference when retrying an error, and guards double submit", async () => {
    let resolve: (() => void) | undefined;
    mocks.query.reconcile.mutateAsync.mockRejectedValueOnce(new Error("Respuesta no recibida"));
    mount();
    await openForm();
    completeForm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar conciliación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Respuesta no recibida");
    expect(screen.getByLabelText("Evidencia revisada obligatoria")).toHaveValue("Documento QA de entrega");
    mocks.query.reconcile.mutateAsync.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    const save = screen.getByRole("button", { name: "Guardar conciliación" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(mocks.query.reconcile.mutateAsync).toHaveBeenCalledTimes(2);
    const [first, second] = mocks.query.reconcile.mutateAsync.mock.calls.map(([input]) => input);
    expect(first).toMatchObject({ invoiceId: fixture().invoices[0].invoice_id, lineIndex: 0, expectedHash: "a".repeat(64), quoteLineId: lineId, quantity: 1 });
    expect(second.requestKey).toBe(first.requestKey);
    resolve?.();
    await waitFor(() => expect(screen.getByRole("button", { name: "Revisar partida" })).toBeInTheDocument());
  });

  it("cancels without writing and refreshes the authoritative history before another decision", async () => {
    mount();
    await openForm();
    completeForm();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar revisión" }));
    expect(mocks.query.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.query.reconcile.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar revisión" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revisar historial de cargos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revisar partida" }));
    expect(screen.getByLabelText("Motivo obligatorio")).toHaveValue("");
  });

  it("blocks closing an in-flight review and confirms before discarding an unfinished review", async () => {
    const view = mount();
    await openForm();
    completeForm();
    mocks.query.reconcile.isPending = true;
    view.rerender(<QuoteChargeLegacyReview quoteId={quoteId} quoteNumber="COT-QA" />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    mocks.query.reconcile.isPending = false;
    view.rerender(<QuoteChargeLegacyReview quoteId={quoteId} quoteNumber="COT-QA" />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByLabelText("Motivo obligatorio")).toHaveValue("Evidencia comprobada");
    expect(mocks.query.reconcile.mutateAsync).not.toHaveBeenCalled();
  });

  it("hides actions on a failed refresh and exposes a recoverable query error", async () => {
    mocks.query.isError = true;
    mocks.query.error = new Error("Consulta fallida");
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revisar historial de cargos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Consulta fallida");
    expect(screen.queryByRole("button", { name: "Revisar partida" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar consulta" }));
    expect(mocks.query.refetch).toHaveBeenCalled();
  });

  it("reverts an existing decision with a new mandatory reason and evidence instead of deleting it", async () => {
    const data = fixture();
    const review = { id: "10700000-0000-4000-8000-000000000004", classification: "rental" as const, quote_line_id: null, quantity: null,
      reason: "Renta verificada", evidence: "Contrato QA", actor_id: "10700000-0000-4000-8000-000000000005", created_at: "2026-10-01T00:00:00Z" };
    Object.assign(data.invoices[0].lines[0], { pending: false, review, history: [{ ...review, reversed_at: null, reversal_reason: null, reversal_evidence: null, reversed_by: null }] });
    mocks.query.data = data;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revisar historial de cargos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revertir revisión" }));
    expect(screen.queryByLabelText("Clasificación revisada")).not.toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Revertir con auditoría" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo obligatorio"), { target: { value: "Corregir clasificación" } });
    fireEvent.change(screen.getByLabelText("Evidencia revisada obligatoria"), { target: { value: "Nueva evidencia QA" } });
    fireEvent.click(save);
    await waitFor(() => expect(mocks.query.reverse.mutateAsync).toHaveBeenCalledOnce());
    expect(mocks.query.reverse.mutateAsync.mock.calls[0][0]).toMatchObject({ reviewId: review.id, reason: "Corregir clasificación", evidence: "Nueva evidencia QA" });
    expect(mocks.query.reconcile.mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps empty positive invoices and partial native origins pending without offering an impossible action", async () => {
    const data = fixture();
    data.invoices[0].empty_positive = true;
    Object.assign(data.invoices[0].lines[0], { line: { source_quote_id: null }, reviewable: false, blocked_reason: "Origen nativo incompleto: requiere revisión técnica" });
    mocks.query.data = data;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revisar historial de cargos" }));
    expect(await screen.findByText(/Importe positivo sin partidas verificables/)).toBeInTheDocument();
    expect(screen.getByText(/Origen nativo incompleto/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revisar partida" })).not.toBeInTheDocument();
  });
});

describe("review response completeness", () => {
  it("rejects wrong tenant scope, missing state, duplicate original line references and malformed hashes", () => {
    expect(() => parseLegacyChargeReview(fixture(), lineId)).toThrow();
    const value = fixture();
    value.invoices[0].lines.push(value.invoices[0].lines[0]);
    expect(() => parseLegacyChargeReview(value, quoteId)).toThrow();
    const malformed = fixture();
    malformed.invoices[0].lines[0].line_hash = "changed";
    expect(() => parseLegacyChargeReview(malformed, quoteId)).toThrow();
    expect(() => parseLegacyChargeReview({ ...fixture(), complete: false }, quoteId)).toThrow();
  });
});
