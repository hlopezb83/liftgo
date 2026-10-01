import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const { state, refetch } = vi.hoisted(() => ({ state: { isError: false }, refetch: vi.fn() }));
beforeEach(() => { state.isError = false; refetch.mockReset(); });

vi.mock("../../hooks/useBankMatchCandidates", async () => {
  const actual = await vi.importActual<typeof import("../../hooks/useBankMatchCandidates")>(
    "../../hooks/useBankMatchCandidates",
  );
  return {
    ...actual,
    useBankMatchCandidates: () => ({
      data: [
        {
          id: "sp-1",
          kind: "supplier_payment",
          candidate_date: "2024-01-01",
          amount: 100,
          reference: null,
          label: "Proveedor X",
          score: 95,
          day_diff: 0,
          exact_amount: true,
          reference_hit: false,
        },
      ],
      isFetching: false,
      isError: state.isError,
      refetch,
    }),
  };
});

import { BankMatchCandidateList } from "../BankMatchCandidateList";

describe("BankMatchCandidateList", () => {
  it("shows an inline retry on failure and hides stale candidates and ignore advice", () => {
    state.isError = true;
    const { Wrapper } = createQueryWrapper();
    render(<Wrapper><BankMatchCandidateList lineId="line-1" currency="MXN" search="" onSearchChange={vi.fn()}
      dateWindow={15} onDateWindowChange={vi.fn()} onSelect={vi.fn()} /></Wrapper>);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar");
    expect(screen.queryByText(/marca.*ignorado/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("bank-candidate-match")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
  // F7: onSelect debe propagar el `kind` del candidato (tabla destino real),
  // no inferirlo por el signo de la línea.
  it("propaga id y kind del candidato al hacer click en Emparejar", () => {
    const onSelect = vi.fn();
    const { Wrapper } = createQueryWrapper();
    render(
      <Wrapper>
        <BankMatchCandidateList
          lineId="line-1"
          currency="MXN"
          search=""
          onSearchChange={() => {}}
          dateWindow={15}
          onDateWindowChange={() => {}}
          onSelect={onSelect}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId("bank-candidate-match"));
    expect(onSelect).toHaveBeenCalledWith("sp-1", "supplier_payment");
  });

  // F5: el importe del candidato se formatea con la moneda de la cuenta,
  // no siempre en MXN.
  it("formatea el importe con la moneda de la cuenta (USD)", () => {
    const { Wrapper } = createQueryWrapper();
    render(
      <Wrapper>
        <BankMatchCandidateList
          lineId="line-1"
          currency="USD"
          search=""
          onSearchChange={() => {}}
          dateWindow={15}
          onDateWindowChange={() => {}}
          onSelect={() => {}}
        />
      </Wrapper>,
    );
    expect(screen.getByText(/USD|US\$/)).toBeInTheDocument();
  });
});
