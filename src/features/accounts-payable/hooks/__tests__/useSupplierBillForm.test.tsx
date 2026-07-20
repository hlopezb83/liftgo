import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (antes del import del hook) ---
const createMutate = vi.fn();
const updateMutate = vi.fn();
const guardSpy = vi.fn<(dirty: boolean) => void>();

vi.mock("@/features/suppliers", () => ({
  useSuppliers: () => ({
    data: [
      { id: "sup-1", name: "Prov Uno", default_payment_terms_days: 30 },
      { id: "sup-2", name: "Prov Dos", default_payment_terms_days: null },
    ],
  }),
}));

vi.mock("../useSupplierBillMutations", () => ({
  useCreateSupplierBill: () => ({ mutate: createMutate, isPending: false }),
  useUpdateSupplierBill: () => ({ mutate: updateMutate, isPending: false }),
}));

vi.mock("@/hooks/useUnsavedChangesGuard", () => ({
  useUnsavedChangesGuard: (dirty: boolean) => guardSpy(dirty),
}));

vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyValidation: vi.fn(),
}));

// Import DESPUÉS de los mocks.
import { useSupplierBillForm } from "../useSupplierBillForm";
import type { SupplierBillDetail } from "../useSupplierBill";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const onClose = vi.fn();

async function submit(result: { current: ReturnType<typeof useSupplierBillForm> }) {
  void result.current.form.formState.errors;
  await act(async () => {
    await result.current.onSubmit({
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as React.BaseSyntheticEvent);
  });
}

describe("useSupplierBillForm (UX-M2)", () => {
  beforeEach(() => {
    createMutate.mockReset();
    updateMutate.mockReset();
    guardSpy.mockReset();
    onClose.mockReset();
    createMutate.mockImplementation((_p, opts) => opts?.onSuccess?.({ id: "bill-1", bill_number: "SB-0001" }));
    updateMutate.mockImplementation((_p, opts) => opts?.onSuccess?.());
  });

  it("rechaza submit sin proveedor/categoría (no llama mutate)", async () => {
    const { result } = renderHook(() => useSupplierBillForm(true, onClose), { wrapper });
    await submit(result);
    expect(createMutate).not.toHaveBeenCalled();
    expect(result.current.form.formState.errors.supplier_id).toBeTruthy();
    expect(result.current.form.formState.errors.category).toBeTruthy();
  });

  it("crea la factura con payload normalizado (fechas YMD, total calculado)", async () => {
    const { result } = renderHook(() => useSupplierBillForm(true, onClose), { wrapper });
    act(() => {
      result.current.form.setValue("supplier_id", "sup-1");
      result.current.form.setValue("category", "renta");
      result.current.form.setValue("issue_date", new Date(2026, 0, 15));
      result.current.form.setValue("subtotal", 1000);
      result.current.form.setValue("tax_amount", 160);
      result.current.form.setValue("retention_iva", 20);
      result.current.form.setValue("retention_isr", 10);
    });
    await submit(result);
    expect(createMutate).toHaveBeenCalledTimes(1);
    const payload = createMutate.mock.calls[0][0];
    expect(payload.supplier_id).toBe("sup-1");
    expect(payload.issue_date).toBe("2026-01-15");
    expect(payload.total).toBe(1000 + 160 - 20 - 10);
    expect(payload.currency).toBe("MXN");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("aplica dueDate sugerido según default_payment_terms_days del proveedor", async () => {
    const { result } = renderHook(() => useSupplierBillForm(true, onClose), { wrapper });
    act(() => {
      result.current.form.setValue("supplier_id", "sup-1");
      result.current.form.setValue("issue_date", new Date(2026, 0, 1));
    });
    await waitFor(() => {
      expect(result.current.form.getValues("due_date")).toBeInstanceOf(Date);
    });
    const due = result.current.form.getValues("due_date") as Date;
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(0);
    expect(due.getDate()).toBe(31);
  });

  it("no sobreescribe due_date en modo edición aunque cambie el proveedor", async () => {
    const bill: SupplierBillDetail = {
      id: "bill-9",
      bill_number: "SB-0009",
      supplier_id: "sup-1",
      category: "renta",
      description: null,
      issue_date: "2026-01-10",
      due_date: "2026-02-01",
      coverage_start: null,
      coverage_end: null,
      currency: "MXN",
      exchange_rate: 1,
      subtotal: 500,
      tax_amount: 80,
      retention_iva: 0,
      retention_isr: 0,
      total: 580,
      balance: 580,
      status: "pendiente",
      cfdi_uuid: null,
      cfdi_xml_url: null,
      payment_method_sat: null,
    } as unknown as SupplierBillDetail;

    const { result } = renderHook(() => useSupplierBillForm(true, onClose, bill), { wrapper });
    await waitFor(() => {
      expect(result.current.form.getValues("supplier_id")).toBe("sup-1");
    });
    const original = result.current.form.getValues("due_date") as Date;
    expect(original.getMonth()).toBe(1); // febrero
    // Cambia proveedor a uno con reglas distintas — no debe pisar due_date.
    act(() => {
      result.current.form.setValue("supplier_id", "sup-2");
    });
    const after = result.current.form.getValues("due_date") as Date;
    expect(after.getTime()).toBe(original.getTime());
  });

  it("edita usa updateMutate con id del bill original", async () => {
    const bill: SupplierBillDetail = {
      id: "bill-9",
      bill_number: "SB-0009",
      supplier_id: "sup-1",
      category: "renta",
      description: null,
      issue_date: "2026-01-10",
      due_date: null,
      coverage_start: null,
      coverage_end: null,
      currency: "MXN",
      exchange_rate: 1,
      subtotal: 500,
      tax_amount: 80,
      retention_iva: 0,
      retention_isr: 0,
      total: 580,
      balance: 580,
      status: "pendiente",
      cfdi_uuid: null,
      cfdi_xml_url: null,
      payment_method_sat: null,
    } as unknown as SupplierBillDetail;

    const { result } = renderHook(() => useSupplierBillForm(true, onClose, bill), { wrapper });
    await waitFor(() => expect(result.current.form.getValues("supplier_id")).toBe("sup-1"));
    await submit(result);
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const call = updateMutate.mock.calls[0][0];
    expect(call.id).toBe("bill-9");
    expect(call.patch.total).toBe(580);
  });

  it("useUnsavedChangesGuard se sincroniza con isDirty y open", async () => {
    const { result } = renderHook(() => useSupplierBillForm(true, onClose), { wrapper });
    // arranque: no dirty
    expect(guardSpy).toHaveBeenLastCalledWith(false);
    act(() => {
      result.current.form.setValue("supplier_id", "sup-1", { shouldDirty: true });
    });
    await waitFor(() => {
      expect(guardSpy).toHaveBeenLastCalledWith(true);
    });
  });

  it("no dispara el guard cuando el diálogo está cerrado", () => {
    renderHook(() => useSupplierBillForm(false, onClose), { wrapper });
    expect(guardSpy).toHaveBeenLastCalledWith(false);
  });
});
