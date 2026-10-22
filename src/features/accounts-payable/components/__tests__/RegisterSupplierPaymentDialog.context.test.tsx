import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const { register, upload } = vi.hoisted(() => ({
  register: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("../../hooks/useRegisterSupplierPayment", () => ({
  useRegisterSupplierPayment: () => ({
    isPending: false,
    mutateAsync: register,
  }),
}));
vi.mock("../../hooks/useUploadSupplierReceipt", () => ({
  useUploadSupplierReceipt: () => ({ isPending: false, mutateAsync: upload }),
  removeSupplierReceipt: vi.fn(),
}));
import { RegisterSupplierPaymentDialog } from "../RegisterSupplierPaymentDialog";

describe("Regression: context preservation on payment balance refresh", () => {
  it("control: unchanged balance preserves input and Cancelar asks before discarding", () => {
    const close = vi.fn();
    const props = {
      open: true,
      onOpenChange: close,
      billId: "qa-bill",
      billNumber: "QA-BILL",
      balance: 1000,
    };
    const { rerender } = render(<RegisterSupplierPaymentDialog {...props} />);
    fireEvent.change(screen.getByLabelText(/Referencia/), {
      target: { value: "CONTROL-REF" },
    });
    rerender(<RegisterSupplierPaymentDialog {...props} />);
    expect(screen.getByLabelText(/Referencia/)).toHaveValue("CONTROL-REF");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("¿Descartar cambios?")).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByLabelText(/Referencia/)).toHaveValue("CONTROL-REF");
  });
  it("preserves partial amount, reference, note and file after balance prop changes", () => {
    const close = vi.fn();
    const props = {
      open: true,
      onOpenChange: close,
      billId: "qa-bill",
      billNumber: "QA-BILL",
      currency: "MXN",
    };
    const { rerender } = render(
      <RegisterSupplierPaymentDialog {...props} balance={1000} />,
    );
    const amount = screen.getByLabelText(/Monto/);
    fireEvent.change(amount, { target: { value: "300" } });
    fireEvent.blur(amount);
    fireEvent.change(screen.getByLabelText(/Referencia/), {
      target: { value: "QA-TRANSFER" },
    });
    fireEvent.change(screen.getByLabelText(/Notas/), {
      target: { value: "Preservar nota" },
    });
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, {
      target: {
        files: [
          new File(["qa"], "qa-receipt.pdf", { type: "application/pdf" }),
        ],
      },
    });
    expect(screen.getByText("qa-receipt.pdf")).toBeInTheDocument();
    expect(screen.getByLabelText(/Referencia/)).toHaveValue("QA-TRANSFER");
    expect(screen.getByLabelText(/Notas/)).toHaveValue("Preservar nota");
    rerender(<RegisterSupplierPaymentDialog {...props} balance={700} />);
    expect(screen.getByLabelText(/Referencia/)).toHaveValue("QA-TRANSFER");
    expect(screen.getByLabelText(/Notas/)).toHaveValue("Preservar nota");
    expect(screen.queryByText("qa-receipt.pdf")).toBeInTheDocument();
    expect(
      (screen.getByLabelText(/Monto/) as HTMLInputElement).value,
    ).toContain("300");
    expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByText("¿Descartar cambios?")).toBeInTheDocument();
  });
});
it("resets capture when bill identity changes and on reopening, not on refetch", () => {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    billId: "a",
    billNumber: "A",
    balance: 1000,
  };
  const { rerender } = render(<RegisterSupplierPaymentDialog {...props} />);
  fireEvent.change(screen.getByLabelText(/Referencia/), {
    target: { value: "A-only" },
  });
  rerender(
    <RegisterSupplierPaymentDialog
      {...props}
      billId="b"
      billNumber="B"
      balance={700}
    />,
  );
  expect(screen.getByLabelText(/Referencia/)).toHaveValue("");
  expect((screen.getByLabelText(/Monto/) as HTMLInputElement).value).toContain(
    "700",
  );
  fireEvent.change(screen.getByLabelText(/Referencia/), {
    target: { value: "B-only" },
  });
  rerender(
    <RegisterSupplierPaymentDialog {...props} billId="b" open={false} />,
  );
  rerender(
    <RegisterSupplierPaymentDialog {...props} billId="b" balance={600} />,
  );
  expect(screen.getByLabelText(/Referencia/)).toHaveValue("");
  expect((screen.getByLabelText(/Monto/) as HTMLInputElement).value).toContain(
    "600",
  );
});
it("validates the preserved amount against the newest balance before any upload or payment", async () => {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    billId: "a",
    billNumber: "A",
    balance: 1000,
  };
  const { rerender } = render(<RegisterSupplierPaymentDialog {...props} />);
  fireEvent.change(screen.getByLabelText(/Monto/), {
    target: { value: "300" },
  });
  fireEvent.blur(screen.getByLabelText(/Monto/));
  rerender(<RegisterSupplierPaymentDialog {...props} balance={200} />);
  fireEvent.click(screen.getByRole("button", { name: "Registrar pago" }));
  expect(
    await screen.findByText("El monto no puede ser mayor al saldo"),
  ).toBeInTheDocument();
  expect(register).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});
