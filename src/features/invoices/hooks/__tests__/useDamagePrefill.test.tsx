import { act, renderHook, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { buildEmptyInvoiceValues, EMPTY_LINE, type InvoiceFormValues } from "../../lib/invoiceFormSchema";
import { useDamagePrefill } from "../useDamagePrefill";

const { state, selectCustomer, warning, readDamage } = vi.hoisted(() => ({
  state: {
    damage: {
      status: "repaired", repaired_at: "2026-09-30T18:00:00Z", customer_id: "customer-a",
      estimated_cost: 1300, actual_cost: 650 as number | null, actual_cost_source: null as string | null,
    },
    waitingForCustomer: false,
  },
  selectCustomer: vi.fn(), warning: vi.fn(), readDamage: vi.fn(),
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyWarning: warning }));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => "org-a" }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => "actor-a:org-a" }));
vi.mock("@/features/customers", () => ({
  useCustomer: (id?: string) => ({
    data: id && !state.waitingForCustomer ? { id, name: "Cliente verificado" } : undefined,
    isPending: !id || state.waitingForCustomer, isError: false, refetch: vi.fn(),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const chain = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), abortSignal: vi.fn(), maybeSingle: readDamage };
      for (const method of ["select", "eq", "is", "abortSignal"] as const) chain[method].mockReturnValue(chain);
      return chain;
    },
  },
}));

function renderPrefill() {
  const { Wrapper } = createQueryWrapper();
  return renderHook(() => {
    const form = useForm<InvoiceFormValues>({ defaultValues: buildEmptyInvoiceValues() });
    const prefill = useDamagePrefill({ damageId: "damage-a", form, handleCustomerSelect: selectCustomer });
    return { form, ...prefill };
  }, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.waitingForCustomer = false;
  state.damage = {
    status: "repaired", repaired_at: "2026-09-30T18:00:00Z", customer_id: "customer-a",
    estimated_cost: 1300, actual_cost: 650, actual_cost_source: null,
  };
  readDamage.mockImplementation(async () => ({ data: state.damage, error: null }));
});

describe("factura desde daño reparado", () => {
  it("sugiere costo real y usa el cliente verificado de la ficha del daño", async () => {
    const { result } = renderPrefill();
    await waitFor(() => expect(result.current.block).toBeNull());
    expect(result.current.form.getValues("lineItems")).toEqual([
      expect.objectContaining({ unit_price: 650, quantity: 1, total: 650 }),
    ]);
    expect(selectCustomer).toHaveBeenCalledWith("customer-a", { id: "customer-a", name: "Cliente verificado" });
  });
  it.each([null, 0])("no rellena el presupuesto como costo real ausente (%s)", async (actual_cost) => {
    state.damage.actual_cost = actual_cost;
    const { result } = renderPrefill();
    await waitFor(() => expect(warning).toHaveBeenCalled());
    expect(result.current.form.getValues("lineItems")).toEqual([]);
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ title: "Sin costo real de reparación registrado" }));
  });
  it.each(["manual", "maintenance"])("reconoce cero intencional de %s sin crear una partida fiscal de cero", async (source) => {
    state.damage.actual_cost = 0;
    state.damage.actual_cost_source = source;
    const { result } = renderPrefill();
    await waitFor(() => expect(warning).toHaveBeenCalled());
    expect(result.current.form.getValues("lineItems")).toEqual([]);
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ title: "Reparación con costo interno de $0" }));
  });
  it.each(["reported", "invoiced"])("bloquea y no prellena un daño %s", async (status) => {
    state.damage.status = status;
    const { result } = renderPrefill();
    await waitFor(() => expect(result.current.block).toMatch(/reparación|facturado/));
    expect(result.current.form.getValues("lineItems")).toEqual([]);
    expect(selectCustomer).not.toHaveBeenCalled();
  });
  it("no sobreescribe la captura cuando llega tarde el cliente", async () => {
    state.waitingForCustomer = true;
    const { result, rerender } = renderPrefill();
    await waitFor(() => expect(readDamage).toHaveBeenCalledOnce());
    const manual = { ...EMPTY_LINE, description: "Captura manual", quantity: 1, unit_price: 50, total: 50 };
    act(() => result.current.form.setValue("lineItems", [manual], { shouldDirty: true }));
    state.waitingForCustomer = false;
    rerender();
    expect(result.current.block).toMatch(/Cambiaste el borrador/);
    expect(result.current.form.getValues("lineItems")).toEqual([manual]);
    expect(selectCustomer).not.toHaveBeenCalled();
  });
});
