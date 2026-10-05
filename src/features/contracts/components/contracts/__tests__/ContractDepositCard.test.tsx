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
  it.each([
    { stored: null, expected: "$10,000.00" },
    { stored: 4_000, expected: "$4,000.00" },
  ])("explica el importe efectivo al dejar vacío un depósito devuelto ($stored)", ({ stored, expected }) => {
    render(<ContractDepositCard {...base} depositStatus="returned" depositSettledAmount={stored} />);
    const amount = screen.getByLabelText("Importe devuelto (MXN)");
    fireEvent.change(amount, { target: { value: "" } });
    expect(screen.getByText(`Si lo dejas vacío, se registrarán ${expected}.`)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Devolución revisada" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar estado del depósito" }));
    expect(mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ status: "returned", amount: null }));
  });

  it("no ofrece guardar un depósito sin cambios", () => {
    render(<ContractDepositCard {...base} />);
    expect(screen.getByRole("button", { name: "Guardar estado del depósito" })).toBeDisabled();
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

    expect(screen.getByLabelText("Importe aplicado (MXN)")).toHaveValue(4_000);
    const save = screen.getByRole("button", { name: "Guardar estado del depósito" });
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
