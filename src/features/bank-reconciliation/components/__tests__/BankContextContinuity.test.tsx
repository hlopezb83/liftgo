import {
  fireEvent,
  render,
  screen,
  within,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { BankReconciliationWorkspace } from "@/features/bank-reconciliation/components/BankReconciliationWorkspace";
const m = vi.hoisted(() => ({
  ignore: vi.fn(),
  confirm: vi.fn(),
  single: vi.fn(),
}));
vi.mock(
  "@/features/bank-reconciliation/hooks/mutations/useBankBulkActions",
  () => ({
    useConfirmBankMatches: () => ({ mutate: m.confirm, isPending: false }),
    useIgnoreBankLines: () => ({ mutate: m.ignore, isPending: false }),
  }),
);
vi.mock(
  "@/features/bank-reconciliation/hooks/useBankReconciliationMutations",
  () => ({
    useConfirmBankMatch: () => ({ mutate: vi.fn(), isPending: false }),
    useIgnoreBankLine: () => ({ mutate: m.single, isPending: false }),
    useUnmatchBankLine: () => ({ mutate: vi.fn(), isPending: false }),
  }),
);
vi.mock("@/features/bank-reconciliation/hooks/useBankMatchCandidates", () => ({
  DATE_WINDOW_OPTIONS: [7, 15, 30],
  useBankMatchCandidates: () => ({
    data: [],
    isFetching: false,
    isError: false,
    isPending: false,
  }),
}));
const lines = ["A", "B"].map((id) => ({
  id,
  bank_account_id: "account-one",
  import_id: "fixture",
  posted_date: "2026-10-18",
  description: `Movimiento ${id}`,
  reference: id,
  signed_amount: 100,
  status: "unmatched" as const,
  matched_payment_id: null,
  matched_supplier_payment_id: null,
  suggested_payment_id: null,
  suggested_supplier_payment_id: null,
  match_score: null,
  matched_at: null,
  ignored_reason: null,
}));
function row(id: string) {
  return document.querySelector(`[data-bank-line-id="${id}"]`)!.closest("tr")!;
}
function mount() {
  const q = new QueryClient();
  const props = {
    lines,
    bankAccountId: "account-one",
    currency: "MXN",
    isLoading: false,
    status: "all" as const,
    search: "",
    onStatusChange: vi.fn(),
    onSearchChange: vi.fn(),
  };
  const content = (over = {}) => (
    <QueryClientProvider client={q}>
      <BankReconciliationWorkspace {...props} {...over} />
    </QueryClientProvider>
  );
  const v = render(content());
  return (over: object) => v.rerender(content(over));
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("clears selection and reason when filters change", () => {
  const rerender = mount();
  fireEvent.click(within(row("A")).getByRole("checkbox"));
  fireEvent.change(screen.getByTestId("bank-bulk-reason"), {
    target: { value: "reason A" },
  });
  rerender({ lines: [lines[1]], search: "B" });
  expect(screen.queryByText("Movimiento A")).toBeNull();
  expect(screen.queryByTestId("bank-bulk-toolbar")).toBeNull();
  expect(m.ignore).not.toHaveBeenCalled();
  fireEvent.click(within(row("B")).getByRole("checkbox"));
  expect(screen.getByTestId("bank-bulk-reason")).toHaveValue("");
});
it("clears selection and reason on account change", () => {
  const rerender = mount();
  fireEvent.click(within(row("A")).getByRole("checkbox"));
  fireEvent.change(screen.getByTestId("bank-bulk-reason"), {
    target: { value: "reason A" },
  });
  rerender({
    lines: [{ ...lines[1], bank_account_id: "account-two" }],
    bankAccountId: "account-two",
  });
  expect(screen.queryByTestId("bank-bulk-toolbar")).toBeNull();
  expect(m.ignore).not.toHaveBeenCalled();
  fireEvent.click(within(row("B")).getByRole("checkbox"));
  expect(screen.getByTestId("bank-bulk-reason")).toHaveValue("");
});
it("clears the entity-specific reason on J navigation", () => {
  mount();
  fireEvent.click(row("A"));
  fireEvent.change(screen.getByTestId("bank-panel-ignore-reason"), {
    target: { value: "Comisión exclusiva de A" },
  });
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "j" });
  expect(
    within(screen.getByRole("dialog")).getByText("Movimiento B"),
  ).toBeInTheDocument();
  expect(screen.getByTestId("bank-panel-ignore-reason")).toHaveValue("");
  expect(screen.getByTestId("bank-panel-ignore-submit")).toBeDisabled();
  expect(m.single).not.toHaveBeenCalled();
});
it("control: explicit Limpiar removes bulk toolbar before changing filters", () => {
  const rerender = mount();
  fireEvent.click(within(row("A")).getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
  rerender({ lines: [lines[1]], search: "B" });
  expect(screen.queryByTestId("bank-bulk-toolbar")).toBeNull();
  expect(m.ignore).not.toHaveBeenCalled();
});
it("control: closing inspector before opening B clears reason", () => {
  mount();
  fireEvent.click(row("A"));
  fireEvent.change(screen.getByTestId("bank-panel-ignore-reason"), {
    target: { value: "Only A" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  fireEvent.click(row("B"));
  expect(screen.getByTestId("bank-panel-ignore-reason")).toHaveValue("");
  expect(screen.getByTestId("bank-panel-ignore-submit")).toBeDisabled();
  expect(m.single).not.toHaveBeenCalled();
});

it("keeps draft and selection for a same-account refresh but submits only visible actionable IDs", () => {
  const rerender = mount();
  fireEvent.click(within(row("A")).getByRole("checkbox"));
  fireEvent.click(within(row("B")).getByRole("checkbox"));
  fireEvent.change(screen.getByTestId("bank-bulk-reason"), {
    target: { value: "Visible reason" },
  });
  rerender({ lines: [{ ...lines[1] }] });
  expect(screen.getByTestId("bank-bulk-count")).toHaveTextContent(
    "1 seleccionados",
  );
  fireEvent.click(screen.getByTestId("bank-bulk-ignore"));
  expect(m.ignore).toHaveBeenCalledWith(
    { lineIds: ["B"], bankAccountId: "account-one", reason: "Visible reason" },
    expect.any(Object),
  );
});
it("preserves the same movement reason through a query refresh", () => {
  const rerender = mount();
  fireEvent.click(row("A"));
  fireEvent.change(screen.getByTestId("bank-panel-ignore-reason"), {
    target: { value: "Only A" },
  });
  rerender({ lines: lines.map((line) => ({ ...line })) });
  expect(screen.getByTestId("bank-panel-ignore-reason")).toHaveValue("Only A");
});
