import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { InvoicePaymentSummary } from "../InvoicePaymentSummary";

const mocks = vi.hoisted(() => ({ canWrite: false, stamp: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => mocks.canWrite }));
vi.mock("@/features/bank-reconciliation", () => ({ ReconciliationBadge: () => null }));
vi.mock("../../../hooks/invoices/cfdi/usePaymentComplement", () => ({
  useStampPaymentComplement: () => ({ mutate: mocks.stamp, isPending: false }),
}));
vi.mock("../../../hooks/invoices/cfdi/useRefreshCancellationStatus", () => ({
  useRefreshRepCancellationStatus: () => ({ mutate: mocks.refresh, isPending: false }),
}));
vi.mock("../EditPaymentDialog", () => ({ EditPaymentDialog: () => <div role="dialog">Editar pago abierto</div> }));
vi.mock("../CancelRepDialog", () => ({ CancelRepDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">Cancelar REP abierto</div> : null }));

const payments = [
  { id: "p-none", amount: 100, currency: "USD", payment_date: "2026-09-27", payment_method: "transfer", rep_cfdi_status: "none" },
  { id: "p-stamped", amount: 200, currency: "USD", payment_date: "2026-09-26", payment_method: "transfer", rep_cfdi_status: "stamped" },
  { id: "p-cancel", amount: 50, currency: "USD", payment_date: "2026-09-25", payment_method: "transfer",
    rep_cfdi_status: "stamped", rep_cancellation_status: "pending" },
] as unknown as Tables<"payments">[];
const props = { payments, totalPaid: 350, creditedAmount: 200, balance: 842, ppdStamped: true, currency: "USD" };

function renderSummary(allowRepMutations = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => <QueryClientProvider client={client}>
    <InvoicePaymentSummary {...props} allowRepMutations={allowRepMutations} />
  </QueryClientProvider>;
  const result = render(view());
  return { ...result, refresh: () => result.rerender(view()) };
}

beforeEach(() => { mocks.canWrite = false; vi.clearAllMocks(); });
afterEach(cleanup);

describe("Historial de pagos — permisos y moneda", () => {
  it("consulta conserva importes, estados y descargas sin ofrecer modificaciones", () => {
    renderSummary();
    expect(screen.getByText("Historial de Pagos")).toBeInTheDocument();
    expect(screen.getByText("Cancelación REP en proceso")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Descargar REP PDF" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Descargar REP XML" })).toHaveLength(2);
    for (const action of ["Editar pago", "Timbrar REP", "Cancelar REP", "Consultar estado SAT"]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
    }
  });

  it("escritura permite REP y editar pagos sin timbrar, mantiene el bloqueo fiscal", () => {
    mocks.canWrite = true;
    renderSummary();
    fireEvent.click(screen.getByRole("button", { name: "Timbrar REP" }));
    expect(mocks.stamp).toHaveBeenCalledWith("p-none");
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado SAT" }));
    expect(mocks.refresh).toHaveBeenCalledWith("p-cancel");
    const edit = screen.getAllByRole("button", { name: "Editar pago" });
    expect(edit.filter((button) => button.hasAttribute("disabled"))).toHaveLength(2);
    fireEvent.click(edit[0]);
    expect(screen.getByRole("dialog")).toHaveTextContent("Editar pago abierto");
  });

  it("al perder permiso desaparece un editor ya abierto", () => {
    mocks.canWrite = true;
    const { refresh } = renderSummary();
    fireEvent.click(screen.getAllByRole("button", { name: "Editar pago" })[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    mocks.canWrite = false;
    refresh();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancelación de factura impide nuevos REP pero permite consultar una cancelación en proceso", () => {
    mocks.canWrite = true;
    renderSummary(false);
    expect(screen.queryByRole("button", { name: "Timbrar REP" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar REP" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar estado SAT" })).toBeInTheDocument();
  });

  it("los resúmenes usan USD sin convertir importes a pesos", () => {
    renderSummary();
    expect(screen.getByText(/(?:US\$|USD\s+)350\.00/)).toBeInTheDocument();
    expect(screen.getByText(/−(?:US\$|USD\s+)200\.00/)).toBeInTheDocument();
    expect(screen.getByText(/(?:US\$|USD\s+)842\.00/)).toBeInTheDocument();
  });
});
