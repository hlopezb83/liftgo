import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

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
    }),
  };
});

import { BankMatchCandidateList } from "../BankMatchCandidateList";

describe("BankMatchCandidateList", () => {
  // F7: onSelect debe propagar el `kind` del candidato (tabla destino real),
  // no inferirlo por el signo de la línea.
  it("propaga id y kind del candidato al hacer click en Emparejar", () => {
    const onSelect = vi.fn();
    const { Wrapper } = createQueryWrapper();
    render(
      <Wrapper>
        <BankMatchCandidateList
          lineId="line-1"
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
});
