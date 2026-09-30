import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BankAccountsPage from "../BankAccountsPage";

const state = vi.hoisted(() => ({ canWrite: false }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => state.canWrite }));
vi.mock("@/hooks/use-mobile", () => ({ useIsTabletOrBelow: () => true }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/feedback/useConfirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("../../hooks/useBankAccounts", () => ({
  useBankAccounts: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useDeleteBankAccount: () => ({ mutate: vi.fn() }),
}));
vi.mock("../../components/BankAccountFormDialog", () => ({
  BankAccountFormDialog: () => <div data-testid="bank-account-form" />,
}));

describe("BankAccountsPage permissions", () => {
  beforeEach(() => { state.canWrite = false; });

  it("keeps read-only access without rendering mutation controls", () => {
    render(<BankAccountsPage />);
    expect(screen.getByText("Cuentas bancarias")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nueva cuenta/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("bank-account-form")).not.toBeInTheDocument();
  });

  it("renders the create action for full access", () => {
    state.canWrite = true;
    render(<BankAccountsPage />);
    expect(screen.getByRole("button", { name: /Nueva cuenta/i })).toBeInTheDocument();
  });
});
