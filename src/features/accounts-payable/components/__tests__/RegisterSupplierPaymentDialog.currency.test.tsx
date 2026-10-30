import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

vi.mock("../../hooks/useRegisterSupplierPayment", () => ({
  useRegisterSupplierPayment: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("../../hooks/useUploadSupplierReceipt", () => ({
  useUploadSupplierReceipt: () => ({ isPending: false, mutateAsync: vi.fn() }),
  removeSupplierReceipt: vi.fn(),
}));

import { RegisterSupplierPaymentDialog } from "../RegisterSupplierPaymentDialog";

describe("Supplier payment currency", () => {
  it.each(["MXN", "USD"])("labels the balance and unchanged amount in %s", (currency) => {
    render(<RegisterSupplierPaymentDialog
      open onOpenChange={vi.fn()} billId="fixture-bill" billNumber="FIXTURE-USD-123456789"
      balance={1234567.89} currency={currency}
    />);

    expect(screen.getByText(currency, { exact: true })).toBeInTheDocument();
    expect(Number((screen.getByLabelText(/Monto/) as HTMLInputElement).value.replaceAll(",", ""))).toBe(1234567.89);
    expect(screen.getByText(formatCurrencyWithCode(1234567.89, currency).replaceAll("\u00a0", " "))).toBeInTheDocument();
    expect(screen.queryByText(currency === "USD" ? "MXN" : "USD", { exact: true })).not.toBeInTheDocument();
  });
});
