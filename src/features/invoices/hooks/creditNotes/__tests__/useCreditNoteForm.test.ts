import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { createQueryWrapper } from "@/test/helpers/queryClient";

/**
 * useCreditNoteForm — la regla fiscal `exceedsMax = total > maxCreditable + 0.01`
 * decide si el botón "Crear" se habilita. Si la tolerancia se rompe, el sistema
 * permite emitir notas de crédito mayores a la factura origen → riesgo SAT.
 */

const createMutate = vi.fn();
vi.mock("../useCreditNotes", () => ({
  useCreateCreditNote: () => ({
    mutate: createMutate,
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    reset: vi.fn(),
  }),
}));

import { useCreditNoteForm } from "../useCreditNoteForm";

function mkInvoice(over: Partial<Tables<"invoices">> = {}) {
  return {
    id: "inv-1",
    customer_id: "cust-1",
    tax_rate: 16,
    moneda: "MXN",
    line_items: [
      { description: "Renta", quantity: 1, unit_price: 1000, total: 1000 },
    ] as unknown as Tables<"invoices">["line_items"],
    ...over,
  } as Tables<"invoices">;
}

function render(maxCreditable: number, invoice = mkInvoice()) {
  const { Wrapper } = createQueryWrapper();
  return renderHook(() => useCreditNoteForm(invoice, maxCreditable, vi.fn()), { wrapper: Wrapper });
}

describe("useCreditNoteForm — regla de maxCreditable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("total exacto = maxCreditable → exceedsMax false (canSubmit con razón)", () => {
    // 1000 + 16% = 1160 → maxCreditable también 1160
    const { result } = render(1160);
    act(() => result.current.setReason("Devolución"));
    expect(result.current.total).toBe(1160);
    expect(result.current.exceedsMax).toBe(false);
    expect(result.current.canSubmit).toBe(true);
  });

  it("total = max + 0.005 → dentro de tolerancia (no exceedsMax)", () => {
    // total seguirá siendo 1160 con line items enteros; bajamos max para forzar el borde
    const { result } = render(1159.995);
    act(() => result.current.setReason("Devolución"));
    // 1160 > 1159.995 + 0.01 = 1160.005 ? → false (1160 < 1160.005)
    expect(result.current.exceedsMax).toBe(false);
    expect(result.current.canSubmit).toBe(true);
  });

  it("total = max + 0.02 → exceedsMax true, canSubmit false", () => {
    const { result } = render(1159.98);
    act(() => result.current.setReason("Devolución"));
    // 1160 > 1159.98 + 0.01 = 1159.99 → true
    expect(result.current.exceedsMax).toBe(true);
    expect(result.current.canSubmit).toBe(false);
  });

  it("razón vacía → canSubmit false aunque monto sea válido", () => {
    const { result } = render(99999);
    expect(result.current.reason).toBe("");
    expect(result.current.canSubmit).toBe(false);
  });

  it("total = 0 (sin líneas seleccionadas) → canSubmit false", () => {
    const { result } = render(99999);
    act(() => result.current.setReason("Devolución"));
    act(() => {
      // Deseleccionar la única línea
      result.current.updateLine(0, { _selected: false });
    });
    expect(result.current.total).toBe(0);
    expect(result.current.canSubmit).toBe(false);
  });

  it("submit con todo válido invoca createMutation con líneas seleccionadas", () => {
    const { result } = render(99999);
    act(() => result.current.setReason("Devolución parcial"));
    act(() => result.current.submit(false));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [payload] = createMutate.mock.calls[0];
    expect(payload).toMatchObject({
      invoice_id: "inv-1",
      customer_id: "cust-1",
      reason_text: "Devolución parcial",
      total: 1160,
      stamp: false,
    });
  });
});
