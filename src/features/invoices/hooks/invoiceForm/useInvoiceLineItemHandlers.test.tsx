import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  invoiceFormSchema,
  buildEmptyInvoiceValues,
  EMPTY_LINE,
  type InvoiceFormValues,
} from "@/lib/schemas/invoiceFormSchema";
import { useInvoiceLineItemHandlers } from "./useInvoiceLineItemHandlers";

function setupHook() {
  return renderHook(() => {
    const form = useForm<InvoiceFormValues>({
      resolver: zodResolver(invoiceFormSchema),
      defaultValues: buildEmptyInvoiceValues(),
    });
    const handlers = useInvoiceLineItemHandlers(form);
    return { form, handlers };
  });
}

describe("useInvoiceLineItemHandlers (useFieldArray integration)", () => {
  it("inicia con array vacío", () => {
    const { result } = setupHook();
    expect(result.current.handlers.fields).toHaveLength(0);
    expect(result.current.form.getValues("lineItems")).toEqual([]);
  });

  it("addLineItem agrega una partida con defaults de EMPTY_LINE", () => {
    const { result } = setupHook();
    act(() => result.current.handlers.addLineItem());
    expect(result.current.handlers.fields).toHaveLength(1);
    const item = result.current.form.getValues("lineItems.0");
    expect(item.description).toBe(EMPTY_LINE.description);
    expect(item.quantity).toBe(1);
    expect(item.clave_prod_serv).toBe("78181500");
    expect(item.clave_unidad).toBe("DAY");
  });

  it("removeLineItem elimina la partida indicada", () => {
    const { result } = setupHook();
    act(() => {
      result.current.handlers.addLineItem();
      result.current.handlers.addLineItem();
    });
    expect(result.current.handlers.fields).toHaveLength(2);
    act(() => result.current.handlers.removeLineItem(0));
    expect(result.current.handlers.fields).toHaveLength(1);
  });

  it("updateLineItem recalcula total cuando cambia quantity", () => {
    const { result } = setupHook();
    act(() => result.current.handlers.addLineItem());
    act(() => result.current.handlers.updateLineItem(0, "unit_price", 250));
    act(() => result.current.handlers.updateLineItem(0, "quantity", 4));
    const item = result.current.form.getValues("lineItems.0");
    expect(item.quantity).toBe(4);
    expect(item.unit_price).toBe(250);
    expect(item.total).toBe(1000);
  });

  it("updateLineItem recalcula total cuando cambia unit_price", () => {
    const { result } = setupHook();
    act(() => result.current.handlers.addLineItem());
    act(() => result.current.handlers.updateLineItem(0, "quantity", 3));
    act(() => result.current.handlers.updateLineItem(0, "unit_price", 19.99));
    const item = result.current.form.getValues("lineItems.0");
    // currency.js evita drift: 19.99 × 3 = 59.97
    expect(item.total).toBe(59.97);
  });

  it("updateLineItem en 'description' NO recalcula total", () => {
    const { result } = setupHook();
    act(() => result.current.handlers.addLineItem());
    act(() => result.current.handlers.updateLineItem(0, "quantity", 2));
    act(() => result.current.handlers.updateLineItem(0, "unit_price", 100));
    const beforeTotal = result.current.form.getValues("lineItems.0.total");
    act(() => result.current.handlers.updateLineItem(0, "description", "Cambio texto"));
    const after = result.current.form.getValues("lineItems.0");
    expect(after.description).toBe("Cambio texto");
    expect(after.total).toBe(beforeTotal);
  });

  it("cada partida mantiene un id estable de useFieldArray", () => {
    const { result } = setupHook();
    act(() => {
      result.current.handlers.addLineItem();
      result.current.handlers.addLineItem();
    });
    const ids = result.current.handlers.fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });

  it("trigger de validación reporta 'Cantidad ≥ 1' cuando quantity = 0", async () => {
    const { result } = setupHook();
    act(() => result.current.handlers.addLineItem());
    act(() => result.current.handlers.updateLineItem(0, "quantity", 0));
    let valid = true;
    await act(async () => {
      valid = await result.current.form.trigger("lineItems");
    });
    expect(valid).toBe(false);
    const err = result.current.form.formState.errors.lineItems?.[0]?.quantity?.message;
    expect(err).toBe("Cantidad ≥ 1");
  });
});
