import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ register: vi.fn(), upload: vi.fn(), removeReceipt: vi.fn() }));
vi.mock("../../hooks/useRegisterSupplierPayment", () => ({
  useRegisterSupplierPayment: () => ({ isPending: false, mutateAsync: fixture.register }),
}));
vi.mock("../../hooks/useUploadSupplierReceipt", () => ({
  useUploadSupplierReceipt: () => ({ isPending: false, mutateAsync: fixture.upload }),
  removeSupplierReceipt: fixture.removeReceipt,
}));

import { RegisterSupplierPaymentDialog } from "../RegisterSupplierPaymentDialog";

describe("Supplier payment receipt failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.upload.mockResolvedValue({ path: "fixture-company/supplier-bills/receipt.pdf" });
    fixture.register.mockRejectedValue(new Error("fixture payment rejected"));
    fixture.removeReceipt.mockResolvedValue({ error: null });
  });

  it("removes the newly uploaded receipt when payment fails and keeps the capture open", async () => {
    const onOpenChange = vi.fn();
    render(<RegisterSupplierPaymentDialog open onOpenChange={onOpenChange}
      billId="fixture-bill" billNumber="FIXTURE-USD" balance={900} currency="USD" />);
    fireEvent.change(screen.getByLabelText(/Referencia/), { target: { value: "FIXTURE-TRANSFER" } });
    const file = new File(["fixture receipt"], "fixture-receipt.pdf", { type: "application/pdf" });
    // The input is rendered through the dialog portal outside the render container.
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar pago" }));

    await waitFor(() => expect(fixture.register).toHaveBeenCalledTimes(1));
    expect(fixture.register).toHaveBeenCalledWith(expect.objectContaining({
      bill_id: "fixture-bill", amount: 900, reference: "FIXTURE-TRANSFER",
      receipt_url: "fixture-company/supplier-bills/receipt.pdf",
    }));
    await waitFor(() => expect(fixture.removeReceipt).toHaveBeenCalledWith("fixture-company/supplier-bills/receipt.pdf"));
    expect(fixture.upload).toHaveBeenCalledWith({ file, billId: "fixture-bill" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /Registrar pago/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Referencia/)).toHaveValue("FIXTURE-TRANSFER");
  });

  it("does not attempt to remove a pre-existing receipt when no new file was uploaded", async () => {
    const onOpenChange = vi.fn();
    render(<RegisterSupplierPaymentDialog open onOpenChange={onOpenChange}
      billId="fixture-bill" billNumber="FIXTURE-MXN" balance={900} currency="MXN" />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar pago" }));
    await waitFor(() => expect(fixture.register).toHaveBeenCalledTimes(1));
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.removeReceipt).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
