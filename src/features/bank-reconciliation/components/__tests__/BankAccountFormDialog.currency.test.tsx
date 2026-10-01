import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { history } = vi.hoisted(() => ({
  history: { data: undefined as boolean | undefined, isSuccess: false, isFetching: true, isError: false, refetch: vi.fn() },
}));
vi.mock("../../hooks/useBankStatementLines", () => ({ useBankAccountHasLines: () => history }));
vi.mock("../../hooks/useBankAccounts", () => ({ useUpsertBankAccount: () => ({ mutate: vi.fn(), isPending: false }) }));
import { BankAccountFormDialog } from "../BankAccountFormDialog";

const account = {
  id: "bank-1", name: "BBVA Operación", bank: "BBVA", last4: "0001",
  currency: "MXN", initial_balance: 0, is_active: true, notes: null,
};
beforeEach(() => {
  history.data = undefined;
  history.isSuccess = false;
  history.isFetching = true;
  history.isError = false;
});

describe("bank account currency verification", () => {
  it("locks the selector while checking history instead of assuming there are no statements", async () => {
    await act(async () => { render(<BankAccountFormDialog open initial={account} onOpenChange={vi.fn()} />); });
    expect(screen.getByRole("combobox", { name: "Moneda" })).toBeDisabled();
    expect(screen.getByText("Verificando movimientos importados…")).toBeInTheDocument();
  });
  it("keeps currency locked and offers retry when verification fails", async () => {
    history.isFetching = false;
    history.isError = true;
    await act(async () => { render(<BankAccountFormDialog open initial={account} onOpenChange={vi.fn()} />); });
    expect(screen.getByRole("combobox", { name: "Moneda" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reintentar verificación de moneda" })).toBeInTheDocument();
  });
  it("allows currency only after a successful empty-history check", async () => {
    Object.assign(history, { data: false, isSuccess: true, isFetching: false });
    await act(async () => { render(<BankAccountFormDialog open initial={account} onOpenChange={vi.fn()} />); });
    expect(screen.getByRole("combobox", { name: "Moneda" })).not.toBeDisabled();
  });
  it("locks accounts with imported statements even after a successful check", async () => {
    Object.assign(history, { data: true, isSuccess: true, isFetching: false });
    await act(async () => { render(<BankAccountFormDialog open initial={account} onOpenChange={vi.fn()} />); });
    expect(screen.getByRole("combobox", { name: "Moneda" })).toBeDisabled();
    expect(screen.getByText(/La moneda no se puede cambiar porque/)).toBeInTheDocument();
  });
});
