import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrmQuote } from "@/features/quotes";
import type { Prospect } from "../../lib/prospectTypes";
import { useProspectForm } from "../useProspectForm";

const state = vi.hoisted(() => ({
  options: [] as CrmQuote[], selected: null as CrmQuote | null,
  pending: false, fetching: false, error: false, optionsError: false,
}));
vi.mock("@/features/quotes", () => ({
  useCrmQuoteOptions: () => ({ data: { pages: [state.options] }, isFetching: false, isError: state.optionsError, hasNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() }),
  // Deliberately permits stale/mismatched mock data to test the form's ID guard too.
  useCrmQuote: () => ({ data: state.selected, isPending: state.pending, isFetching: state.fetching, isError: state.error, refetch: vi.fn() }),
}));
const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const oldId = id(1102);
const newId = id(1);
const quote = (quoteId = oldId): CrmQuote => ({ id: quoteId, quote_number: `COT-${quoteId.slice(-4)}`, customer_name: "Updated quote customer", total: 9999, currency: "USD", tipo_cambio: 20, status: "sent" });
const prospect = { id: "prospect-1", companyName: "Historical CRM company", contactPerson: null, email: null, phone: null, dealValue: 21170, notes: null, quoteId: oldId, stage: "negociacion" } as Prospect;
const mount = () => renderHook(() => useProspectForm({ prospect, open: true, defaultStage: "nuevo_prospecto" }));
beforeEach(() => {
  state.options = Array.from({ length: 50 }, (_, index) => quote(id(index + 1)));
  state.selected = quote(); state.pending = false; state.fetching = false; state.error = false; state.optionsError = false;
});
afterEach(cleanup);

describe("CRM linked quote preservation and fail-closed validation", () => {
  it("pins a relation outside the initial page without overwriting historical company or manual amount", () => {
    const { result } = mount();
    expect(result.current.selectedQuote?.id).toBe(oldId);
    expect(result.current.matchingQuotes.some((q) => q.id === oldId)).toBe(true);
    expect(result.current.fields.company).toBe("Historical CRM company");
    expect(result.current.fields.dealValue).toBe("21170");
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setters.setNotes("Only a note"));
    act(() => expect(result.current.buildPayload()).toMatchObject({ quote_id: oldId, deal_value: 21170, company_name: "Historical CRM company", notes: "Only a note" }));
  });

  it.each(["pending", "fetching", "error"] as const)("blocks save while linked quote is %s, even with cached valid data", (flag) => {
    state[flag] = true;
    const { result } = mount();
    act(() => expect(result.current.buildPayload()).toBeNull());
    expect(result.current.fields.formError).toMatch(/cotización vinculada/);
    expect(result.current.fields.quoteId).toBe(oldId);
    expect(result.current.fields.dealValue).toBe("21170");
    act(() => result.current.setters.handleQuoteChange("none"));
    act(() => expect(result.current.buildPayload()).toMatchObject({ quote_id: null, deal_value: 21170 }));
  });

  it("keeps an unavailable ID and blocks save until explicit unlink", () => {
    state.selected = null;
    const { result } = mount();
    act(() => expect(result.current.buildPayload()).toBeNull());
    expect(result.current.fields.quoteId).toBe(oldId);
    expect(result.current.fields.formError).toMatch(/no está disponible/);
    act(() => result.current.setters.handleQuoteChange("none"));
    act(() => expect(result.current.buildPayload()).toMatchObject({ quote_id: null, deal_value: 21170 }));
  });

  it("blocks missing FX for an old USD reference regardless of selector options or manual amount", () => {
    state.selected = { ...quote(), tipo_cambio: null };
    const { result } = mount();
    act(() => result.current.setters.setDealValue("25000"));
    act(() => expect(result.current.buildPayload()).toBeNull());
    expect(result.current.fields.dealValueError).toMatch(/tipo de cambio válido/);
  });

  it("late recovery or refetch does not overwrite edits, quote selection, amount or company", () => {
    state.selected = null; state.pending = true;
    const { result, rerender } = mount();
    act(() => { result.current.setters.setCompany("User edited company"); result.current.setters.setDealValue("12345.67"); result.current.setters.setNotes("New note"); });
    state.selected = quote(); state.pending = false;
    rerender();
    expect(result.current.fields).toMatchObject({ company: "User edited company", dealValue: "12345.67", notes: "New note", quoteId: oldId });
    act(() => expect(result.current.buildPayload()).toMatchObject({ quote_id: oldId, deal_value: 12345.67 }));
    state.selected = { ...quote(), total: 5, tipo_cambio: 10 };
    rerender();
    expect(result.current.fields.dealValue).toBe("12345.67");
    act(() => result.current.setters.handleQuoteChange("none"));
    rerender();
    expect(result.current.selectedQuote).toBeNull();
    act(() => expect(result.current.buildPayload()).toMatchObject({ quote_id: null, deal_value: 12345.67 }));
  });

  it("a different selected ID cannot be validated by the previous quote's cached data", () => {
    const { result, rerender } = mount();
    act(() => result.current.setters.handleQuoteChange(newId));
    expect(result.current.fields.quoteId).toBe(newId);
    expect(result.current.selectedQuote).toBeNull();
    act(() => expect(result.current.buildPayload()).toBeNull());
    state.selected = { ...quote(newId), tipo_cambio: null };
    rerender();
    act(() => expect(result.current.buildPayload()).toBeNull());
    expect(result.current.fields.dealValueError).toMatch(/tipo de cambio válido/);
  });

  it("selector search errors do not invalidate an independently verified relation", () => {
    state.optionsError = true; state.options = [];
    const { result } = mount();
    expect(result.current.quoteSelection.isError).toBe(true);
    act(() => expect(result.current.buildPayload()).toMatchObject({ quote_id: oldId, deal_value: 21170 }));
  });
});
