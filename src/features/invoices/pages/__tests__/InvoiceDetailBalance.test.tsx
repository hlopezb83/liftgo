import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InvoiceDetail from "../InvoiceDetail";

const mocks = vi.hoisted(() => ({
  invoice: vi.fn(), payments: vi.fn(), credits: vi.fn(),
  retryInvoice: vi.fn(), retryPayments: vi.fn(), retryCredits: vi.fn(),
}));
vi.mock("@/lib/router-compat", () => ({ useParams: () => ({ id: "inv-usd" }) }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/features/users", () => ({ useUserRole: () => ({ data: "admin" }) }));
vi.mock("@/features/company-settings", () => ({ useCompanySettings: () => ({ data: undefined }) }));
vi.mock("@/features/quotes", () => ({ useQuote: () => ({ data: undefined }) }));
vi.mock("../../hooks/invoices/useInvoiceBookings", () => ({ useInvoiceBookings: () => ({ data: [] }) }));
vi.mock("../../hooks/invoices/useInvoices", () => ({ useInvoice: mocks.invoice }));
vi.mock("../../hooks/usePayments", () => ({ usePayments: mocks.payments }));
vi.mock("../../hooks/creditNotes/useCreditNotes", () => ({ useCreditNotesForInvoice: mocks.credits }));
vi.mock("../../hooks/invoiceDetail/useInvoiceDetailActions", () => ({ useInvoiceDetailActions: () => ({}) }));
vi.mock("../../components/invoice-detail/InvoiceDetailBody", () => ({
  InvoiceDetailBody: ({ derived }: { derived: { balance: number; totalPaid: number; creditedAmount: number } }) => (
    <section aria-label="Detalle financiero">
      <output aria-label="Saldo">{derived.balance}</output>
      <output aria-label="Pagado">{derived.totalPaid}</output>
      <output aria-label="Acreditado">{derived.creditedAmount}</output>
      <button>Registrar pago</button>
    </section>
  ),
}));

const invoice = { id: "inv-usd", invoice_number: "BORRADOR-0001", status: "sent",
  cfdi_status: "stamped", total: 1392, moneda: "USD", tipo_cambio: 18.4321, line_items: [] };
const ready = { isLoading: false, isPending: false, isError: false, isFetching: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.invoice.mockReturnValue({ ...ready, data: invoice, refetch: mocks.retryInvoice });
  mocks.payments.mockReturnValue({ ...ready, data: [], refetch: mocks.retryPayments });
  mocks.credits.mockReturnValue({ ...ready, data: [], refetch: mocks.retryCredits });
});
afterEach(cleanup);

describe("InvoiceDetail — saldo sólo con dependencias completas", () => {
  it.each(["payments", "credits"] as const)("espera %s sin mostrar saldo ni registrar pago", (dependency) => {
    mocks[dependency].mockReturnValue({ ...ready, isLoading: true, isPending: true, data: undefined });
    render(<InvoiceDetail />);
    expect(screen.queryByLabelText("Detalle financiero")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar pago" })).not.toBeInTheDocument();
  });

  it("una consulta pausada sin datos tampoco equivale a cero pagos", () => {
    mocks.payments.mockReturnValue({ ...ready, isPending: true, data: undefined });
    render(<InvoiceDetail />);
    expect(screen.queryByLabelText("Saldo")).not.toBeInTheDocument();
  });

  it.each(["payments", "credits"] as const)("muestra error y permite reintentar cuando falla %s", (dependency) => {
    mocks[dependency].mockReturnValue({ ...ready, isError: true, data: undefined,
      refetch: dependency === "payments" ? mocks.retryPayments : mocks.retryCredits });
    render(<InvoiceDetail />);
    expect(screen.queryByLabelText("Saldo")).not.toBeInTheDocument();
    expect(screen.getByText(/No se pudo cargar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.retryPayments).toHaveBeenCalledTimes(1);
    expect(mocks.retryCredits).toHaveBeenCalledTimes(1);
  });

  it("un error de actualización no presenta el saldo guardado como confiable", () => {
    mocks.payments.mockReturnValue({ ...ready, isError: true, data: [{ amount: 400, currency: "USD" }],
      refetch: mocks.retryPayments });
    render(<InvoiceDetail />);
    expect(screen.getByText(/No se pudo cargar/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Saldo")).not.toBeInTheDocument();
  });

  it("un error es recuperable aunque la otra dependencia aún esté pendiente", () => {
    mocks.payments.mockReturnValue({ ...ready, isError: true, data: undefined, refetch: mocks.retryPayments });
    mocks.credits.mockReturnValue({ ...ready, isPending: true, data: undefined, refetch: mocks.retryCredits });
    render(<InvoiceDetail />);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("cero pagos y cero notas consultados correctamente conservan el total", () => {
    render(<InvoiceDetail />);
    expect(screen.getByLabelText("Saldo")).toHaveTextContent("1392");
  });

  it("resta pagos convertidos y sólo notas vigentes en moneda de factura", () => {
    mocks.payments.mockReturnValue({ ...ready, data: [{ amount: 1843.21, currency: "MXN" }], refetch: mocks.retryPayments });
    mocks.credits.mockReturnValue({ ...ready, data: [
      { total: 200, cfdi_status: "stamped", status: "issued", cancellation_status: null },
      { total: 300, cfdi_status: "pending", status: "draft", cancellation_status: null },
      { total: 50, cfdi_status: "stamped", status: "cancelled", cancellation_status: "accepted" },
    ], refetch: mocks.retryCredits });
    render(<InvoiceDetail />);
    expect(screen.getByLabelText("Pagado")).toHaveTextContent("100");
    expect(screen.getByLabelText("Acreditado")).toHaveTextContent("200");
    expect(screen.getByLabelText("Saldo")).toHaveTextContent("1092");
  });
});
