import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ContractDetail from "../ContractDetail";

/**
 * Ronda 4 (FE4-02): un contrato que falla al cargar debe mostrar
 * QueryErrorState, no el mensaje de "no encontrado".
 */

const useContractDetailLogicMock = vi.fn();

vi.mock("../../hooks/contractDetail/useContractDetailLogic", () => ({
  useContractDetailLogic: () => useContractDetailLogicMock(),
}));
vi.mock("../../components/contracts/ContractDetailActions", () => ({ ContractDetailActions: () => null }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/components/layout/DetailPageHeader", () => ({ DetailPageHeader: () => null }));
vi.mock("../../components/contracts/ContractConditionsCard", () => ({ ContractConditionsCard: () => null }));
vi.mock("../../components/contracts/ContractDetailCards", () => ({ ContractDetailsCard: () => null, ContractTextCard: () => null }));
vi.mock("../../components/contracts/ContractDepositCard", () => ({
  ContractDepositCard: () => <input aria-label="Borrador del depósito" defaultValue="" />,
}));

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  const client = createTestQueryClient();
  const page = () => (
    <QueryClientProvider client={client}>
      <ContractDetail />
    </QueryClientProvider>
  );
  const view = render(page());
  return { ...view, rerenderPage: () => view.rerender(page()) };
}

beforeEach(() => {
  useContractDetailLogicMock.mockReset();
});

describe("ContractDetail (FE4-02)", () => {
  it("muestra QueryErrorState cuando el contrato falla, no el mensaje de 'no encontrado'", async () => {
    useContractDetailLogicMock.mockReturnValue({
      id: "ct-1",
      contract: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
      setStatus: vi.fn(),
    });

    renderPage();

    expect(await screen.findByText("No se pudo cargar el contrato")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
    expect(screen.queryByText("Contrato no encontrado")).not.toBeInTheDocument();
  });

  it("un error al recargar conserva el contrato y no desmonta el borrador del depósito", async () => {
    const logic = {
      id: "ct-1", contract: { id: "ct-1", contract_number: "CTR-QA", status: "active", booking_id: null,
        start_date: null, end_date: null, updated_at: "2026-11-13T10:00:00+00:00", deposit_amount: 10000 },
      isLoading: false, isError: false, refetch: vi.fn(), setStatus: vi.fn(), setSigner: vi.fn(),
    };
    useContractDetailLogicMock.mockReturnValue(logic);
    const { rerenderPage } = renderPage();
    const draft = await screen.findByLabelText("Borrador del depósito");
    fireEvent.change(draft, { target: { value: "Cambio sin guardar" } });
    useContractDetailLogicMock.mockReturnValue({ ...logic, isError: true });
    rerenderPage();
    expect(await screen.findByText("No se pudo cargar el contrato")).toBeInTheDocument();
    expect(screen.getByLabelText("Borrador del depósito")).toBe(draft);
    expect(draft).toHaveValue("Cambio sin guardar");
  });
});
