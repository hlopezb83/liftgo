import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContractConditionsCard } from "../ContractConditionsCard";
import type { ContractData } from "../ContractPDFButton";

describe("ContractConditionsCard", () => {
  it("muestra una condición de valor cero aunque no haya ubicación ni frecuencia", () => {
    const contract = { late_interest_rate: 0 } as ContractData;

    render(<ContractConditionsCard contract={contract} />);

    expect(screen.getByText("Condiciones de Uso")).toBeInTheDocument();
    expect(screen.getByText("Interés Moratorio")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});
