import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractDepositCard } from "../ContractDepositCard";
import { ContractDepositConflictError } from "../../../lib/contractDepositRpc";

const mutation = vi.hoisted(() => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null as Error | null }));

vi.mock("@/layouts/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../../../hooks/useContracts", () => ({
  useSetContractDepositStatus: () => mutation,
}));

const base = {
  contractId: "contract-1",
  updatedAt: "2026-11-13T10:00:00.123456+00:00",
  depositAmount: 10_000,
  depositStatus: "held",
  depositSettledAt: null,
  depositSettledAmount: null,
  depositNotes: null,
  onReload: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mutation.error = null;
  mutation.isPending = false;
  mutation.reset.mockImplementation(() => { mutation.error = null; });
});

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
    expect(mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ status: "returned", amount: null }), expect.any(Object));
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
      expectedUpdatedAt: base.updatedAt,
      status: "applied",
      amount: 4_000,
      notes: "Aplicado a renta de octubre",
    }, expect.any(Object));
  });

  it("conserva el borrador ante un refetch y sólo adopta la revisión nueva con recarga explícita", async () => {
    const fresh = { ...base, updatedAt: "2026-11-13T10:01:00.000001+00:00", depositStatus: "applied", depositSettledAmount: 4_000, depositNotes: "Otro usuario" };
    base.onReload.mockResolvedValue(fresh);
    const { rerender } = render(<ContractDepositCard {...base} />);
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Mi borrador" } });
    rerender(<ContractDepositCard {...fresh} />);
    expect(screen.getByLabelText("Notas")).toHaveValue("Mi borrador");
    expect(screen.getByRole("button", { name: "Guardar estado del depósito" })).toBeDisabled();
    expect(mutation.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Recargar depósito" }));
    await waitFor(() => expect(screen.getByLabelText("Notas")).toHaveValue("Otro usuario"));
    expect(screen.getByLabelText("Importe aplicado (MXN)")).toHaveValue(4_000);
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Revisión consciente" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar estado del depósito" }));
    expect(mutation.mutate).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedUpdatedAt: fresh.updatedAt, status: "applied", amount: 4_000, notes: "Revisión consciente",
    }), expect.any(Object));
  });

  it("un conflicto no reintenta ni borra el borrador y una recarga fallida permite reintentar", async () => {
    const { rerender } = render(<ContractDepositCard {...base} />);
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Conservar" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar estado del depósito" }));
    mutation.error = new ContractDepositConflictError();
    rerender(<ContractDepositCard {...base} />);
    expect(screen.getByRole("button", { name: "Guardar estado del depósito" })).toBeDisabled();
    base.onReload.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Recargar depósito" }));
    await screen.findByText("No se pudo recargar el depósito. Tus cambios siguen aquí.");
    expect(screen.getByLabelText("Notas")).toHaveValue("Conservar");
    expect(mutation.mutate).toHaveBeenCalledTimes(1);
    base.onReload.mockResolvedValueOnce(base);
    fireEvent.click(screen.getByRole("button", { name: "Recargar depósito" }));
    await waitFor(() => expect(screen.getByLabelText("Notas")).toHaveValue(""));
    expect(mutation.reset).toHaveBeenCalledOnce();
  });

  it("adopta el recibo confirmado para el siguiente guardado y bloquea los campos mientras guarda", async () => {
    const { rerender } = render(<ContractDepositCard {...base} />);
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Confirmada" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar estado del depósito" }));
    const receipt = { ...base, updatedAt: "2026-11-13T10:02:00.123456+00:00", depositNotes: "Confirmada" };
    mutation.isPending = true;
    rerender(<ContractDepositCard {...base} />);
    expect(screen.getByLabelText("Notas")).toBeDisabled();
    await act(async () => mutation.mutate.mock.calls[0][1].onSuccess(receipt));
    mutation.isPending = false;
    rerender(<ContractDepositCard {...receipt} />);
    expect(screen.getByRole("button", { name: "Guardar estado del depósito" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Otra nota" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar estado del depósito" }));
    expect(mutation.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ expectedUpdatedAt: receipt.updatedAt }), expect.any(Object));
  });
});
