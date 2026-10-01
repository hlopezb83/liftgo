import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";
import { useDamagePrefill } from "../useDamagePrefill";

const { state, setValue, selectCustomer, warning, error } = vi.hoisted(() => ({
  state: { damage: {
    status: "repaired", repaired_at: "2026-09-30T18:00:00Z",
    estimated_cost: 1300, actual_cost: 650 as number | null, actual_cost_source: null as string | null,
  } },
  setValue: vi.fn(), selectCustomer: vi.fn(), warning: vi.fn(), error: vi.fn(),
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyWarning: warning, notifyError: error }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: (columns: string) => ({
        eq: () => ({
          is: () => ({
            maybeSingle: () => Promise.resolve({
              data: Object.fromEntries(Object.entries(state.damage).filter(([key]) => columns.split(", ").includes(key))),
              error: null,
            }),
          }),
        }),
      }),
    }),
  },
}));

const customers = [{ id: "customer-a" }] as Tables<"customers">[];
const form = { setValue } as unknown as UseFormReturn<InvoiceFormValues>;
function renderPrefill() {
  return renderHook(() => useDamagePrefill({
    isEdit: false, damageId: "damage-a", damageCustomerId: "customer-a",
    customers, form, handleCustomerSelect: selectCustomer,
  }));
}
beforeEach(() => {
  vi.clearAllMocks();
  state.damage = {
    status: "repaired", repaired_at: "2026-09-30T18:00:00Z",
    estimated_cost: 1300, actual_cost: 650, actual_cost_source: null,
  };
});

describe("factura desde daño reparado", () => {
  it("sugiere costo real positivo y conserva la revisión del precio", async () => {
    renderPrefill();
    await waitFor(() => expect(setValue).toHaveBeenCalled());
    expect(setValue).toHaveBeenCalledWith("lineItems", [
      expect.objectContaining({ unit_price: 650, quantity: 1, total: 650 }),
    ], { shouldDirty: true });
  });
  it.each([null, 0])("no rellena el presupuesto como costo real ausente (%s)", async (actual_cost) => {
    state.damage.actual_cost = actual_cost;
    renderPrefill();
    await waitFor(() => expect(warning).toHaveBeenCalled());
    expect(setValue).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ title: "Sin costo real de reparación registrado" }));
  });
  it.each(["manual", "maintenance"])("reconoce cero intencional de %s sin crear una partida fiscal de cero", async (source) => {
    state.damage.actual_cost = 0;
    state.damage.actual_cost_source = source;
    renderPrefill();
    await waitFor(() => expect(warning).toHaveBeenCalled());
    expect(setValue).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ title: "Reparación con costo interno de $0" }));
  });
  it.each(["reported", "invoiced"])("no prellena un daño %s desde URL directa", async (status) => {
    state.damage.status = status;
    renderPrefill();
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(setValue).not.toHaveBeenCalled();
    expect(selectCustomer).not.toHaveBeenCalled();
  });
});
