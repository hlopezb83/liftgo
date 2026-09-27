import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RentalFinancialSummary } from "../RentalFinancialSummary";

const state = vi.hoisted(() => ({
  booking: { data: { quote_id: "quote", organization_id: "org", currency: "MXN" } as
    { quote_id: string | null; organization_id: string; currency: string } | undefined, isLoading: false, isError: false },
  quote: { data: { id: "quote", organization_id: "org", line_items: [{ discount: 10 }], rental_meta: [] } as
    { id: string; organization_id: string; line_items: { discount: number }[]; rental_meta: unknown[] } | null | undefined,
  isFetching: false, isError: false },
  invoices: { data: [{ subtotal: 4500.67 }] as { subtotal: number }[] | undefined, isLoading: false, isError: false },
}));

vi.mock("@/features/bookings", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/bookings")>(),
  useBooking: () => state.booking,
}));
vi.mock("@/features/quotes", () => ({ quoteKeys: { all: ["quotes"] } }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: () => state.quote,
}));
vi.mock("../../../hooks/contractDetail/useContractFinancialSummary", () => ({
  useContractFinancialSummary: () => state.invoices,
}));

const props = {
  bookingId: "booking", startDate: "2026-09-26", endDate: "2026-10-03",
  dailyRate: 750.50, weeklyRate: 4250.25, monthlyRate: 14500.75,
};

function balance() {
  const label = screen.getByText("Balance Restante");
  const container = label.parentElement;
  if (!container) throw new Error("No se encontró el balance");
  return within(container);
}

beforeEach(() => {
  state.booking = { data: { quote_id: "quote", organization_id: "org", currency: "MXN" }, isLoading: false, isError: false };
  state.quote = { data: { id: "quote", organization_id: "org", line_items: [{ discount: 10 }], rental_meta: [] }, isFetching: false, isError: false };
  state.invoices = { data: [{ subtotal: 4500.67 }], isLoading: false, isError: false };
});

describe("RentalFinancialSummary", () => {
  it("CTR-0003 no promete $5,000.75 brutos ni balance, pero conserva lo facturado neto verificable", () => {
    render(<RentalFinancialSummary {...props} />);
    expect(screen.getByText("Revisar importe pactado")).toBeVisible();
    expect(screen.getByText(/cotización tiene descuento/)).toBeVisible();
    expect(screen.queryByText("$5,000.75")).not.toBeInTheDocument();
    expect(screen.getByText("$4,500.67")).toBeVisible();
    expect(balance().getByText("—")).toBeVisible();
    expect(screen.queryByText("Pendiente")).not.toBeInTheDocument();
  });

  it.each(["ausente", "cargando", "error", "otra organización"])("no revela una estimación con fuente %s", (scenario) => {
    if (scenario === "ausente") state.quote.data = null;
    if (scenario === "cargando") state.quote.isFetching = true;
    if (scenario === "error") state.quote.isError = true;
    if (scenario === "otra organización" && state.quote.data) state.quote.data.organization_id = "other-org";
    render(<RentalFinancialSummary {...props} />);
    expect(screen.queryByText("$5,000.75")).not.toBeInTheDocument();
    expect(screen.getByText("$4,500.67")).toBeVisible();
    expect(balance().getByText("—")).toBeVisible();
  });

  it("una reserva sin cotización conserva su ingreso esperado y balance", () => {
    if (state.booking.data) state.booking.data.quote_id = null;
    state.quote.data = undefined;
    render(<RentalFinancialSummary {...props} />);
    expect(screen.getByText("$5,000.75")).toBeVisible();
    expect(balance().getByText("$500.08")).toBeVisible();
    expect(screen.getByText("Pendiente")).toBeVisible();
  });

  it("un fallo al cargar facturas no se presenta como cero facturado ni balance válido", () => {
    if (state.booking.data) state.booking.data.quote_id = null;
    state.invoices = { data: undefined, isLoading: false, isError: true };
    render(<RentalFinancialSummary {...props} />);
    expect(screen.getByText("$5,000.75")).toBeVisible();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(balance().getByText("—")).toBeVisible();
    expect(screen.getAllByText("No se pudieron verificar las facturas.")).toHaveLength(2);
  });
});
