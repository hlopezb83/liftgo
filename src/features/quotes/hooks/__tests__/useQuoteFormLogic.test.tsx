import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (declarados antes de importar el hook bajo prueba) ---

const createMutate = vi.fn();
const updateMutate = vi.fn();

vi.mock("@/features/customers", () => ({
  useCustomers: () => ({ data: [{ id: "cust-1", name: "Cliente Uno" }] }),
  CustomerSelector: () => null,
}));

vi.mock("@/features/fleet", () => ({
  useEquipmentModels: () => ({
    data: [
      {
        id: "mod-1",
        manufacturer: "Toyota",
        model: "8FGCU25",
        default_daily_rate: 500,
        default_weekly_rate: 3000,
        default_monthly_rate: 12000,
      },
    ],
  }),
}));

vi.mock("../quotes/useQuotes", () => ({
  useQuote: () => ({ data: null }),
  useNextQuoteNumber: () => ({ data: "COT-0099" }),
  useCreateQuote: () => ({ mutate: createMutate, isPending: false }),
  useUpdateQuote: () => ({ mutate: updateMutate, isPending: false }),
}));

vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyValidation: vi.fn(),
}));

vi.mock("@/hooks/useUnsavedChangesGuard", () => ({
  useUnsavedChangesGuard: () => {},
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useParams: () => ({}),
  };
});

// Import DESPUÉS de los mocks.
import { useQuoteFormLogic } from "../useQuoteFormLogic";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/quotes/nueva"]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

async function submit(result: { current: ReturnType<typeof useQuoteFormLogic> }) {
  // Subscribirse a formState.errors antes de submit — RHF usa proxy y sin subscripción
  // el objeto errors se lee como {} aún si la validación falló.
  void result.current.form.formState.errors;
  await act(async () => {
    await result.current.handleSubmit({
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as React.BaseSyntheticEvent);
  });
}

describe("useQuoteFormLogic — submit + guard", () => {
  beforeEach(() => {
    createMutate.mockReset();
    updateMutate.mockReset();
    // Simular ciclo optimista: mutate ejecuta onSuccess de inmediato.
    createMutate.mockImplementation((_payload, opts) => opts?.onSuccess?.());
    updateMutate.mockImplementation((_payload, opts) => opts?.onSuccess?.());
  });

  it("rechaza submit sin cliente (no llama mutate, marca error)", async () => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    await submit(result);
    expect(createMutate).not.toHaveBeenCalled();
    expect(result.current.form.formState.errors.customerId).toBeTruthy();
  });

  it("rechaza renta sin dateRange", async () => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    act(() => {
      result.current.form.setValue("customerId", "cust-1");
      result.current.form.setValue("customerName", "Cliente Uno");
      result.current.form.setValue("rentalLines", [
        { modelId: "mod-1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 12000, discount: 0, discountType: "%" },
      ]);
    });
    await submit(result);
    expect(createMutate).not.toHaveBeenCalled();
    expect(result.current.form.formState.errors.dateRange).toBeTruthy();
  });

  it("rechaza partida de renta sin ninguna tarifa > 0", async () => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    act(() => {
      result.current.form.setValue("customerId", "cust-1");
      result.current.form.setValue("customerName", "Cliente Uno");
      result.current.form.setValue("dateRange", { from: new Date("2026-05-01"), to: new Date("2026-05-31") });
      result.current.form.setValue("rentalLines", [
        { modelId: "mod-1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 0, discount: 0, discountType: "%" },
      ]);
    });
    await submit(result);
    expect(createMutate).not.toHaveBeenCalled();
    const errs = result.current.form.formState.errors as Record<string, unknown>;
    expect(errs.rentalLines).toBeTruthy();
  });

  it("submit renta válida — mutate recibe payload rental_meta y quote_type='rental'", async () => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    act(() => {
      result.current.form.setValue("customerId", "cust-1");
      result.current.form.setValue("customerName", "Cliente Uno");
      result.current.form.setValue("dateRange", { from: new Date("2026-05-01"), to: new Date("2026-05-31") });
      result.current.form.setValue("rentalLines", [
        { modelId: "mod-1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 12000, discount: 0, discountType: "%" },
      ]);
    });
    await submit(result);
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    const payload = createMutate.mock.calls[0][0];
    expect(payload.quote_type).toBe("rental");
    expect(payload.rental_meta).toBeTruthy();
    expect(payload.currency).toBe("MXN");
    expect(payload.subtotal).toBeGreaterThan(0);
    expect(payload.total).toBeGreaterThan(payload.subtotal);
  });

  it("submit venta válida — rental_meta=null y quote_type='sale'", async () => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    act(() => {
      result.current.handleTypeChange("sale");
      result.current.form.setValue("customerId", "cust-1");
      result.current.form.setValue("customerName", "Cliente Uno");
      result.current.form.setValue("saleLines", [
        { modelId: "mod-1", quantity: 1, unitPrice: 250000, discount: 0, discountType: "%" },
      ]);
    });
    await submit(result);
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    const payload = createMutate.mock.calls[0][0];
    expect(payload.quote_type).toBe("sale");
    expect(payload.rental_meta).toBeNull();
  });

  it("post-submit exitoso limpia isDirty (guard cleanup)", async () => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    act(() => {
      result.current.form.setValue("customerId", "cust-1", { shouldDirty: true });
      result.current.form.setValue("customerName", "Cliente Uno", { shouldDirty: true });
      result.current.form.setValue("dateRange", { from: new Date("2026-05-01"), to: new Date("2026-05-31") }, { shouldDirty: true });
      result.current.form.setValue("rentalLines", [
        { modelId: "mod-1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 12000, discount: 0, discountType: "%" },
      ], { shouldDirty: true });
    });
    expect(result.current.form.formState.isDirty).toBe(true);
    await submit(result);
    await waitFor(() => expect(createMutate).toHaveBeenCalled());
    await waitFor(() => expect(result.current.form.formState.isDirty).toBe(false));
  });

  it("handleTypeChange('sale') resetea dateRange, rentalLines, saleLines, logística", () => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    act(() => {
      result.current.form.setValue("dateRange", { from: new Date("2026-05-01"), to: new Date("2026-05-31") });
      result.current.form.setValue("includeLogistics", true);
      result.current.form.setValue("logisticsCost", 5000);
    });
    act(() => result.current.handleTypeChange("sale"));
    const v = result.current.form.getValues();
    expect(v.quoteType).toBe("sale");
    expect(v.dateRange).toBeUndefined();
    expect(v.rentalLines).toHaveLength(1);
    expect(v.rentalLines[0].modelId).toBe("");
    expect(v.saleLines).toHaveLength(1);
    expect(v.saleLines[0].modelId).toBe("");
    expect(v.includeLogistics).toBe(false);
    expect(v.logisticsCost).toBe(0);
  });
});
