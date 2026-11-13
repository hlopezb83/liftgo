import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { ConfirmProvider } from "@/components/feedback/ConfirmProvider";
import type { ReactNode } from "react";
import { TestRouter } from "@/test/router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyError, notifyValidation } from "@/lib/ui/appFeedback";

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

vi.mock("@/lib/router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/router-compat")>("@/lib/router-compat");
  return {
    ...actual,
    useParams: () => ({}),
  };
});

// Import DESPUÉS de los mocks.
import { useQuoteFormLogic } from "../quoteForm/useQuoteFormLogic";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <TestRouter initialEntries={["/quotes/nueva"]}><ConfirmProvider>{children}</ConfirmProvider></TestRouter>
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
    vi.clearAllMocks();
    createMutate.mockReset();
    updateMutate.mockReset();
    // Simular ciclo optimista: mutate ejecuta onSuccess de inmediato.
    createMutate.mockImplementation((_payload, opts) => opts?.onSuccess?.());
    updateMutate.mockImplementation((_payload, opts) => opts?.onSuccess?.());
  });

  it("rechaza submit sin cliente (no llama mutate, marca error)", async () => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    await waitFor(() => expect(result.current).not.toBeNull());
    await submit(result);
    expect(createMutate).not.toHaveBeenCalled();
    expect(result.current.form.formState.errors.customerId).toBeTruthy();
    expect(notifyValidation).toHaveBeenCalledWith({ title: "Revisa los campos marcados", message: "Hay datos incompletos en el formulario" });
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("rechaza renta sin dateRange", async () => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    await waitFor(() => expect(result.current).not.toBeNull());
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
    await waitFor(() => expect(result.current).not.toBeNull());
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
    await waitFor(() => expect(result.current).not.toBeNull());
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
    await waitFor(() => expect(result.current).not.toBeNull());
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
    await waitFor(() => expect(result.current).not.toBeNull());
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

  it("cambia sin confirmar cuando sólo hay cliente y notas que se conservarán", async () => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    await waitFor(() => expect(result.current).not.toBeNull());
    act(() => {
      result.current.form.setValue("customerId", "cust-1", { shouldDirty: true });
      result.current.form.setValue("notes", "Conservar esta nota", { shouldDirty: true });
    });
    await act(async () => { await result.current.handleTypeChange("sale"); });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(result.current.form.getValues()).toMatchObject({ quoteType: "sale", customerId: "cust-1", notes: "Conservar esta nota" });
  });

  it.each([["rental", "sale"], ["sale", "rental"]] as const)("de %s a %s: cancelar conserva la captura; confirmar limpia sólo las partidas y cargos", async (currentType, nextType) => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    await waitFor(() => expect(result.current).not.toBeNull());
    act(() => {
      result.current.form.setValue("quoteType", currentType);
      result.current.form.setValue("customerId", "cust-1");
      result.current.form.setValue("notes", "Nota que permanece");
      result.current.form.setValue("rentalLines", [{ modelId: "mod-1", quantity: 2, dailyRate: 500, weeklyRate: 0, monthlyRate: 0, discount: 10, discountType: "%" }]);
      result.current.form.setValue("saleLines", [{ modelId: "mod-1", quantity: 3, unitPrice: 120000, discount: 500, discountType: "$" }]);
      result.current.form.setValue("dateRange", { from: new Date("2026-05-01"), to: new Date("2026-05-31") });
      result.current.form.setValue("includeLogistics", true);
      result.current.form.setValue("logisticsCost", 5000);
      result.current.form.setValue("includeInsurance", true);
      result.current.form.setValue("insuranceCost", 3200);
    });
    const original = structuredClone(result.current.form.getValues());
    let change: Promise<void>;
    act(() => { change = result.current.handleTypeChange(nextType); });
    expect(await screen.findByRole("alertdialog", { name: "¿Cambiar el tipo de cotización?" })).toBeVisible();
    expect(result.current.form.getValues()).toEqual(original);
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    await act(async () => { await change; });
    expect(result.current.form.getValues()).toEqual(original);

    act(() => { change = result.current.handleTypeChange(nextType); });
    fireEvent.click(await screen.findByRole("button", { name: "Cambiar y limpiar partidas" }));
    await act(async () => { await change; });
    const v = result.current.form.getValues();
    expect(v.quoteType).toBe(nextType);
    expect(v.dateRange).toBeUndefined();
    expect(v.rentalLines).toHaveLength(1);
    expect(v.rentalLines[0].modelId).toBe("");
    expect(v.saleLines).toHaveLength(1);
    expect(v.saleLines[0].modelId).toBe("");
    expect(v.includeLogistics).toBe(false);
    expect(v.logisticsCost).toBe(0);
    expect(v.includeInsurance).toBe(false);
    expect(v.insuranceCost).toBe(0);
    expect(v.customerId).toBe("cust-1");
    expect(v.notes).toBe("Nota que permanece");
    expect(createMutate).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("protege una partida histórica sin modelo aunque el formulario no esté dirty", async () => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    await waitFor(() => expect(result.current).not.toBeNull());
    act(() => {
      result.current.form.setValue("rentalLines.0.legacyTotal", 1500);
      result.current.form.setValue("rentalLines.0.legacyDescription", "Renta histórica");
    });
    let change: Promise<void>;
    act(() => { change = result.current.handleTypeChange("sale"); });
    expect(await screen.findByRole("alertdialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    await act(async () => { await change; });
    expect(result.current.form.getValues("rentalLines.0.legacyTotal")).toBe(1500);
  });
});
