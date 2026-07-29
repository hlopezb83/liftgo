import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
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
      <MemoryRouter initialEntries={["/contracts/ct-1"]}>
        <Routes>
          <Route path="/contracts/:id" element={<ContractDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useContractDetailLogicMock.mockReset();
});

describe("ContractDetail (FE4-02)", () => {
  it("muestra QueryErrorState cuando el contrato falla, no el mensaje de 'no encontrado'", () => {
    useContractDetailLogicMock.mockReturnValue({
      id: "ct-1",
      contract: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
      setStatus: vi.fn(),
    });

    renderPage();

    expect(screen.getByText("No se pudo cargar el contrato")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
    expect(screen.queryByText("Contrato no encontrado")).not.toBeInTheDocument();
  });
});
