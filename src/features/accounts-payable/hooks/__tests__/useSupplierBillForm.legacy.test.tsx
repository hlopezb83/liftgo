import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  guard: vi.fn(),
}));

vi.mock("@/features/suppliers", () => ({
  useSuppliers: () => ({
    data: [{ id: "00000000-0000-4000-8000-000000000301", default_payment_terms_days: null }],
  }),
}));

vi.mock("@/features/accounts-payable/hooks/useSupplierBillMutations", () => ({
  useCreateSupplierBill: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateSupplierBill: () => ({ mutate: mocks.update, isPending: false }),
}));

vi.mock("@/hooks/useUnsavedChangesGuard", () => ({
  useUnsavedChangesGuard: mocks.guard,
}));

// These imports resolve to the actual selected source tree, not a copied
// payload builder or reimplemented formula. Schema, defaults, totals and the
// form submission path all remain real; the transport is captured at mutate.
import { useSupplierBillForm } from "@/features/accounts-payable/hooks/useSupplierBillForm";
import type { SupplierBillDetail } from "@/features/accounts-payable/hooks/useSupplierBill";

const billId = "00000000-0000-4000-8000-000000000201";
const changedDescription = "Synthetic metadata-only edit";

function fixture(overrides: Partial<SupplierBillDetail> = {}): SupplierBillDetail {
  return {
    id: billId,
    bill_number: "SYNTHETIC-K1-FORM",
    supplier_id: "00000000-0000-4000-8000-000000000301",
    category: "renta",
    description: "Synthetic original description",
    issue_date: "2026-10-18",
    due_date: "2026-11-18",
    coverage_start: null,
    coverage_end: null,
    currency: "USD",
    exchange_rate: 17.123456,
    subtotal: 100,
    discount: 10,
    tax_amount: 16,
    retention_iva: 2,
    retention_isr: 1,
    total: 103,
    balance: 103,
    status: "pending",
    approval_status: "not_required",
    cfdi_uuid: null,
    cfdi_xml_url: null,
    payment_method_sat: "PPD",
    suppliers: null,
    payments: [],
    ...overrides,
  } as unknown as SupplierBillDetail;
}

async function captureEdit(
  bill: SupplierBillDetail,
  changeMoney?: (form: ReturnType<typeof useSupplierBillForm>["form"]) => void,
) {
  const { result } = renderHook(() => useSupplierBillForm(true, vi.fn(), bill));
  await waitFor(() => expect(result.current.form.getValues("supplier_id")).toBe(bill.supplier_id));
  act(() => {
    result.current.form.setValue("description", changedDescription, { shouldDirty: true });
    changeMoney?.(result.current.form);
  });
  await act(async () => {
    await result.current.onSubmit();
  });
  expect(result.current.form.formState.errors).toEqual({});
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledTimes(1);
  const captured = mocks.update.mock.calls[0][0] as {
    id: string;
    patch: Record<string, unknown>;
  };
  expect(captured.id).toBe(bill.id);
  expect(captured.patch.description).toBe(changedDescription);
  expect(captured.patch).not.toHaveProperty("balance");
  expect(captured.patch).not.toHaveProperty("status");
  expect(captured.patch).not.toHaveProperty("approval_status");
  return captured.patch;
}

function expectOriginalMoney(patch: Record<string, unknown>, bill: SupplierBillDetail) {
  for (const key of [
    "currency", "exchange_rate", "subtotal", "discount", "tax_amount",
    "retention_iva", "retention_isr", "total",
  ] as const) {
    // Omitted fields also preserve the database value if a future candidate
    // uses a differential patch. A present field must be exactly unchanged.
    expect({ ...bill, ...patch }[key], key).toBe(bill[key]);
  }
}

describe("K1 real form metadata-only payload compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("control: preserves consistent two-decimal amounts and a six-decimal exchange rate", async () => {
    const bill = fixture();
    const patch = await captureEdit(bill);
    expectOriginalMoney(patch, bill);
  });

  it("captures an unchanged seven-decimal rate in an explicit hypothetical legacy profile", async () => {
    // Current versioned DDL is numeric(14,6). This compatibility input is not
    // evidence that any published row has this precision or that RPC accepts it.
    const bill = fixture({ exchange_rate: 17.1234567 });
    const patch = await captureEdit(bill);
    expectOriginalMoney(patch, bill);
  });

  it("does not repair a cent-precision legacy total that differs from its component formula during a metadata edit", async () => {
    const bill = fixture({ total: 104, balance: 104 });
    const patch = await captureEdit(bill);
    expectOriginalMoney(patch, bill);
  });

  it("preserves a hypothetical bare-numeric legacy total rather than rounding it on a metadata edit", async () => {
    // Not representable by current numeric(14,2) total DDL. Deliberately models
    // only the separate legacy-precision compatibility contract.
    const bill = fixture({ total: 103.004, balance: 103.004 });
    const patch = await captureEdit(bill);
    expectOriginalMoney(patch, bill);
  });

  it("captures unchanged three-decimal components while preserving their existing rounded total", async () => {
    // Bare-numeric compatibility profile only; current money DDL has scale 2.
    // Raw formula = 102.993, existing rounded total = 102.99.
    const bill = fixture({
      subtotal: 100.001,
      discount: 10.002,
      tax_amount: 16.003,
      retention_iva: 2.004,
      retention_isr: 1.005,
      total: 102.99,
      balance: 102.99,
    });
    const patch = await captureEdit(bill);
    expectOriginalMoney(patch, bill);
  });

  it("preserves unchanged three-decimal components and their raw legacy total during a metadata edit", async () => {
    // Same explicit hypothetical bare-numeric profile, with raw total 102.993.
    const bill = fixture({
      subtotal: 100.001,
      discount: 10.002,
      tax_amount: 16.003,
      retention_iva: 2.004,
      retention_isr: 1.005,
      total: 102.993,
      balance: 102.993,
    });
    const patch = await captureEdit(bill);
    expectOriginalMoney(patch, bill);
  });

  it("control: recalculates total when the user actually changes a monetary component", async () => {
    const bill = fixture({ total: 104, balance: 104 });
    const patch = await captureEdit(bill, (form) => {
      form.setValue("subtotal", 120, { shouldDirty: true });
    });
    expect(patch.subtotal).toBe(120);
    expect(patch.total).toBe(123);
  });
});
