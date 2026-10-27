import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import QuoteDetail from "../QuoteDetail";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  assignments: vi.fn(),
  actions: vi.fn(),
  navigate: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("../../hooks/quoteDetail/useQuoteDetailLogic", () => ({ useQuoteDetailLogic: mocks.detail }));
vi.mock("../../hooks/quoteDetail/useQuoteSaleAssignmentStatus", () => ({ useQuoteSaleAssignmentStatus: mocks.assignments }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => mocks.navigate }));
vi.mock("@/lib/router-compat", () => ({ useParams: () => ({ id: "fixture-quote" }) }));
vi.mock("../../components/quotes/QuoteDetailActions", () => ({
  QuoteDetailActions: (props: unknown) => { mocks.actions(props); return null; },
}));
vi.mock("../../components/quotes/QuoteConversionDialogs", () => ({ QuoteConversionDialogs: () => null }));
vi.mock("../../components/quotes/AssignForkliftsCard", () => ({ AssignForkliftsCard: () => <div>Asignación de equipos</div> }));

const lineItems: LineItem[] = [
  { description: "Equipo ficticio con modelo y descripción largos", quantity: 2, unit_price: 125000, total: 250000, discount: 10, discount_type: "%" },
  { description: "Cargo histórico ficticio", quantity: 1, unit_price: 500, total: 500, discount: 50, discount_type: "$" },
];

// Testing Library normalizes the non-breaking space emitted for USD by Intl.
const formatted = (amount: number, currency: string) => formatCurrencyWithCode(amount, currency).replace(/\s/g, " ");

function fixture(currency: string | undefined = "USD") {
  return {
    quote: {
      id: "fixture-quote", quote_number: "COT-QA-USD", status: "draft", quote_type: "rental",
      customer_name: "Cliente ficticio", currency: currency as string | undefined, subtotal: 225450, tax_rate: 16,
      tax_amount: 36072, total: 261522, start_date: "2026-11-01", end_date: "2026-11-30",
      valid_until: "2026-11-10", notes: "Notas ficticias para el cliente",
    },
    isLoading: false, isError: false, lineItems, customerMatch: null,
    quoteType: "rental", isSale: false, alreadyConverted: false, linkedBookingId: null,
    alreadyInvoiced: false, draftInvoiceId: null, isConverting: false,
    setStatus: vi.fn(), handleDelete: vi.fn(), handleConvertClick: vi.fn(), refetchQuote: mocks.refetch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.detail.mockReturnValue(fixture());
  mocks.assignments.mockReturnValue({ isComplete: true, totalAssigned: 0, totalRequired: 0 });
});
afterEach(cleanup);

describe("QuoteDetail: moneda de las partidas", () => {
  it.each(["USD", "MXN"])("rotula unitarios, descuentos e importes en %s sin convertirlos", (currency) => {
    mocks.detail.mockReturnValue(fixture(currency));
    render(<QuoteDetail />);

    const mobile = within(screen.getByTestId("line-items-mobile"));
    expect(mobile.getByText(`Unit. ${formatted(125000, currency)}`)).toBeInTheDocument();
    expect(mobile.getByText(formatted(225000, currency))).toBeInTheDocument();
    expect(mobile.getByText(`Descuento -${formatted(50, currency)}`)).toBeInTheDocument();
    expect(mobile.getByText(formatted(450, currency))).toBeInTheDocument();

    const table = within(screen.getByRole("table"));
    expect(table.getByText(formatted(125000, currency))).toBeInTheDocument();
    expect(table.getByText(formatted(225000, currency))).toBeInTheDocument();
    expect(table.getByText(`-${formatted(50, currency)}`)).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Resumen de la cotización" })).getByText(formatted(261522, currency))).toBeInTheDocument();
    expect(lineItems[0].unit_price).toBe(125000);
    expect(lineItems[0].discount).toBe(10);
    expect(mocks.detail.mock.results[0].value.handleConvertClick).not.toHaveBeenCalled();
  });

  it("conserva el fallback MXN de las cotizaciones sin moneda histórica", () => {
    const historical = fixture();
    historical.quote.currency = undefined;
    mocks.detail.mockReturnValue(historical);
    render(<QuoteDetail />);
    expect(within(screen.getByTestId("line-items-mobile")).getByText(`Unit. ${formatted(125000, "MXN")}`)).toBeInTheDocument();
  });

  it("mantiene la guarda de asignación de una venta aceptada", () => {
    const accepted = fixture();
    accepted.quote.status = "accepted";
    accepted.isSale = true;
    accepted.quoteType = "sale";
    mocks.detail.mockReturnValue(accepted);
    mocks.assignments.mockReturnValue({ isComplete: false, totalAssigned: 1, totalRequired: 2 });
    render(<QuoteDetail />);
    expect(mocks.actions).toHaveBeenCalledWith(expect.objectContaining({
      canInvoice: false,
      invoiceBlockedReason: "Asigna los equipos del inventario antes de facturar (1/2 asignados)",
      onSetStatus: accepted.setStatus,
      onConvertClick: accepted.handleConvertClick,
      onDelete: accepted.handleDelete,
    }));
    expect(screen.getByText("Asignación de equipos")).toBeInTheDocument();
    expect(accepted.setStatus).not.toHaveBeenCalled();
  });

  it("permite volver y distingue el error de carga de un registro ausente", () => {
    const view = render(<QuoteDetail />);
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/quotes");
    mocks.detail.mockReturnValue({ ...fixture(), isError: true });
    view.rerender(<QuoteDetail />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    mocks.detail.mockReturnValue({ ...fixture(), quote: null });
    view.rerender(<QuoteDetail />);
    expect(screen.getByText("Cotización no encontrada")).toBeInTheDocument();
  });
});
