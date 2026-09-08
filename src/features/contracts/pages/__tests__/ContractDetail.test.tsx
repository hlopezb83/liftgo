import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { TestRouter } from "@/test/router";
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

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TestRouter initialEntries={["/contracts/ct-1"]} path="/contracts/$id">
        <ContractDetail />
      </TestRouter>
    </QueryClientProvider>,
  );
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
});
