import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractDepositCard } from "../ContractDepositCard";

const mutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock("@/layouts/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../../../hooks/useContracts", () => ({
  useSetContractDepositStatus: () => mutation,
}));

const base = {
  contractId: "contract-1",
  depositAmount: 10_000,
  depositStatus: "held",
  depositSettledAt: null,
  depositSettledAmount: null,
  depositNotes: null,
};

beforeEach(() => mutation.mutate.mockClear());

describe("ContractDepositCard", () => {
  it("no ofrece guardar un depósito sin cambios", () => {
    render(<ContractDepositCard {...base} />);
    expect(screen.getByRole("button", { name: "Guardar depósito" })).toBeDisabled();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it("conserva el monto parcial al editar sólo las notas", () => {
    render(<ContractDepositCard
      {...base}
      depositStatus="applied"
      depositSettledAt="2026-01-02T10:00:00Z"
      depositSettledAmount={4_000}
      depositNotes="Aplicado a renta"
    />);

    expect(screen.getByLabelText("Monto (opcional)")).toHaveValue(4_000);
    const save = screen.getByRole("button", { name: "Guardar depósito" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Aplicado a renta de octubre" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    expect(mutation.mutate).toHaveBeenCalledWith({
      contractId: "contract-1",
      status: "applied",
      amount: 4_000,
      notes: "Aplicado a renta de octubre",
    });
  });
});
