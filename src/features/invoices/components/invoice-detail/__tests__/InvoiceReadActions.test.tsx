import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { CollectionNotesCard } from "../CollectionNotesCard";
import { InvoiceDetailDialogs } from "../InvoiceDetailDialogs";
import { PaymentIntentsSection } from "../PaymentIntentsSection";
import { ValidateReceptorButton } from "../ValidateReceptorButton";

const mocks = vi.hoisted(() => ({ canWrite: false, role: "auditor", createNote: vi.fn(), review: vi.fn(), validate: vi.fn() }));
vi.mock("@/features/users", () => ({
  useHasModuleAccess: () => mocks.canWrite, useUserRole: () => ({ data: mocks.role }),
}));
vi.mock("../../../hooks/invoices/collections/useCollectionNotes", () => ({
  useCollectionNotes: () => ({ data: [{ id: "note-1", note: "El cliente confirmó recepción", created_at: "2026-09-27", next_followup_date: null }], isLoading: false }),
  useCreateCollectionNote: () => ({ mutate: mocks.createNote, isPending: false }),
}));
vi.mock("@/features/invoices/hooks/paymentIntents", () => ({
  useAdminPaymentIntents: () => ({ data: [{ id: "intent-1", amount: 100, transfer_date: "2026-09-27",
    status: "pending_review", proof_url: "org/proof.pdf" }] }),
  useReviewPaymentIntent: () => ({ mutate: mocks.review, isPending: false }),
}));
vi.mock("../../../hooks/invoiceDetail/useReceptorTaxInfo", () => ({
  useValidateReceptorTaxInfo: () => ({ mutate: mocks.validate, isPending: false }),
}));
vi.mock("../EditReceptorFiscalDialog", () => ({ EditReceptorFiscalDialog: () => null }));
vi.mock("../../invoices/RecordPaymentDialog", () => ({ RecordPaymentDialog: () => <div role="dialog">Registrar pago</div> }));
vi.mock("../CancelCfdiDialog", () => ({ CancelCfdiDialog: () => <div role="dialog">Cancelar CFDI</div> }));
vi.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => <div role="dialog">Eliminar factura</div> }));

function renderWithClient(children: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>);
}

beforeEach(() => { mocks.canWrite = false; mocks.role = "auditor"; vi.clearAllMocks(); });
afterEach(cleanup);

describe("Facturas — acciones auxiliares para usuarios de consulta", () => {
  it("muestra gestiones existentes sin ofrecer alta ni guardado", () => {
    render(<CollectionNotesCard invoiceId="inv-1" />);
    expect(screen.getByText("El cliente confirmó recepción")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva Gestión" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("permite guardar gestiones con acceso completo", () => {
    mocks.canWrite = true;
    render(<CollectionNotesCard invoiceId="inv-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Nueva Gestión" }));
    fireEvent.change(screen.getByPlaceholderText("Ej: Se habló con el contacto, prometió pago para el viernes…"), { target: { value: "Seguimiento de cobro" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mocks.createNote).toHaveBeenCalledWith({ invoice_id: "inv-1", note: "Seguimiento de cobro", next_followup_date: null }, expect.anything());
  });

  it("los intentos conservan comprobante y estado, sin aprobar ni rechazar", () => {
    renderWithClient(<PaymentIntentsSection invoiceId="inv-1" />);
    expect(screen.getByRole("button", { name: "Comprobante" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rechazar" })).not.toBeInTheDocument();
  });

  it("acceso completo permite revisar el intento de pago", () => {
    mocks.canWrite = true;
    renderWithClient(<PaymentIntentsSection invoiceId="inv-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(mocks.review).toHaveBeenCalledWith({ intentId: "intent-1", action: "approve" });
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeInTheDocument();
  });

  it("consulta no monta diálogos de cobros, cancelación o eliminación aun con estado abierto", () => {
    render(<InvoiceDetailDialogs invoiceId="inv-1" invoiceNumber="FAC-0001" invoiceTotal={1392}
      balance={1392} notes="Nota de la factura" showCollectionNotes paymentOpen cancelOpen deleteOpen
      setPaymentOpen={vi.fn()} setCancelOpen={vi.fn()} setDeleteOpen={vi.fn()} onCancelSuccess={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Nota de la factura")).toBeInTheDocument();
    expect(screen.getByText("El cliente confirmó recepción")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    { role: "auditor", canWrite: false }, { role: "ventas", canWrite: true }, { role: "admin", canWrite: false },
  ])("la validación fiscal respeta el rol $role y su acceso $canWrite", ({ role, canWrite }) => {
    mocks.role = role; mocks.canWrite = canWrite;
    render(<ValidateReceptorButton invoice={{ id: "inv-1" } as Tables<"invoices">} />);
    expect(screen.queryByRole("button", { name: "Validar contra SAT" })).not.toBeInTheDocument();
  });

  it.each(["admin", "administrativo"])("%s con acceso completo conserva la validación fiscal", (role) => {
    mocks.role = role; mocks.canWrite = true;
    render(<ValidateReceptorButton invoice={{ id: "inv-1" } as Tables<"invoices">} />);
    expect(screen.getByRole("button", { name: "Validar contra SAT" })).toBeInTheDocument();
  });
});
