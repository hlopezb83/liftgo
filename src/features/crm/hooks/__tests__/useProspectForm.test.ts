import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProspectForm } from "../useProspectForm";
import type { ProspectFormPayload } from "../../lib/prospectFormSchema";
import type { Prospect } from "../../lib/prospectTypes";

const state = vi.hoisted(() => ({ quotes: [] as Array<{
  id: string; total: number; currency: string; tipo_cambio: number | null; customer_name: string;
}> }));
vi.mock("@/features/quotes", () => ({ useQuotes: () => ({ data: state.quotes }) }));

const quoteId = "ab5f48ed-83cd-49d7-8b37-40bf53a10ccf";
const prospect = {
  id: "prospect-1", companyName: "Logística Álamo", contactPerson: null, email: null,
  phone: null, dealValue: 500, notes: null, quoteId: null, stage: "negociacion",
} as Prospect;

beforeEach(() => {
  state.quotes = [{ id: quoteId, total: 1160, currency: "USD", tipo_cambio: 18.25, customer_name: "Logística Álamo" }];
});
afterEach(cleanup);

describe("useProspectForm — alta y moneda", () => {
  it.each([
    { setter: "setNotes", field: "notesError", size: 2001, message: "Las notas admiten hasta 2,000 caracteres." },
    { setter: "setContact", field: "contactError", size: 151, message: "El nombre del contacto admite hasta 150 caracteres." },
    { setter: "setPhone", field: "phoneError", size: 31, message: "El teléfono admite hasta 30 caracteres." },
  ] as const)("ubica el error de $field y lo limpia al corregir", ({ setter, field, size, message }) => {
    const { result } = renderHook(() => useProspectForm({ prospect: null, open: true, defaultStage: "nuevo_prospecto" }));
    act(() => {
      result.current.setters.setCompany("Logística Álamo");
      result.current.setters[setter]("x".repeat(size));
    });
    act(() => { expect(result.current.buildPayload()).toBeNull(); });
    expect(result.current.fields[field]).toBe(message);
    expect(result.current.fields.dealValueError).toBeNull();
    act(() => result.current.setters[setter]("Dato corregido"));
    expect(result.current.fields[field]).toBeNull();
    act(() => { expect(result.current.buildPayload()).not.toBeNull(); });
  });

  it.each(["cotizacion_enviada", "negociacion", "cerrado_ganado"])(
    "una nueva alta desde %s siempre nace en Nuevo Prospecto", (defaultStage) => {
      const { result } = renderHook(() => useProspectForm({ prospect: null, open: true, defaultStage, overrideStage: defaultStage }));
      act(() => result.current.setters.setCompany("Empresa inicial"));
      let payload: ProspectFormPayload | null = null;
      act(() => { payload = result.current.buildPayload(); });
      expect(payload).toMatchObject({ stage: "nuevo_prospecto", deal_value: 0 });
      expect(result.current.requiresDealValue).toBe(false);
    },
  );

  it("conserva la etapa solicitada al editar un prospecto existente", () => {
    const { result } = renderHook(() => useProspectForm({ prospect, open: true, defaultStage: "nuevo_prospecto", overrideStage: "cotizacion_enviada" }));
    let payload: ProspectFormPayload | null = null;
    act(() => { payload = result.current.buildPayload(); });
    expect(payload).toMatchObject({ stage: "cotizacion_enviada", deal_value: 500 });
  });

  it("vincular USD llena y guarda el valor MXN convertido, sin modificar la cotización", () => {
    const { result } = renderHook(() => useProspectForm({ prospect, open: true, defaultStage: "nuevo_prospecto" }));
    act(() => result.current.setters.handleQuoteChange(quoteId));
    expect(result.current.fields.dealValue).toBe("21170");
    let payload: ProspectFormPayload | null = null;
    act(() => { payload = result.current.buildPayload(); });
    expect(payload).toMatchObject({ stage: "negociacion", deal_value: 21170, quote_id: quoteId });
    expect(state.quotes[0].total).toBe(1160);
  });

  it("TC faltante bloquea el guardado incluso después de capturar un valor manual", () => {
    state.quotes[0].tipo_cambio = null;
    const { result } = renderHook(() => useProspectForm({ prospect, open: true, defaultStage: "nuevo_prospecto" }));
    act(() => result.current.setters.handleQuoteChange(quoteId));
    expect(result.current.fields.dealValue).toBe("");
    act(() => result.current.setters.setDealValue("21170"));
    let payload: ProspectFormPayload | null = null;
    act(() => { payload = result.current.buildPayload(); });
    expect(payload).toBeNull();
    expect(result.current.fields.dealValueError).toMatch(/tipo de cambio válido/);
    act(() => result.current.setters.handleQuoteChange("none"));
    act(() => { payload = result.current.buildPayload(); });
    expect(payload).toMatchObject({ deal_value: 21170, quote_id: null });
  });

  it("coloca un correo inválido debajo de Email y lo limpia al corregir", () => {
    const { result } = renderHook(() => useProspectForm({ prospect: null, open: true, defaultStage: "nuevo_prospecto" }));
    act(() => {
      result.current.setters.setCompany("Logística Álamo");
      result.current.setters.setEmail("correo-invalido");
    });
    act(() => { expect(result.current.buildPayload()).toBeNull(); });
    expect(result.current.fields.emailError).toMatch(/correo|email|válido/i);
    expect(result.current.fields.dealValueError).toBeNull();
    act(() => result.current.setters.setEmail("cliente@example.com"));
    expect(result.current.fields.emailError).toBeNull();
    act(() => { expect(result.current.buildPayload()).not.toBeNull(); });
  });
});
