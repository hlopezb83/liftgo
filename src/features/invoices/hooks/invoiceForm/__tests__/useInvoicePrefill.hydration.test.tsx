import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { useInitialRecordVersion } from "@/hooks/useInitialRecordVersion";
import { buildEmptyInvoiceValues, EMPTY_LINE, type InvoiceFormValues } from "../../../lib/invoiceFormSchema";
import type { Customer, ExistingInvoice } from "../invoiceFormBuilders";
import { useInvoicePrefill } from "../useInvoicePrefill";

type Invoice = ExistingInvoice & { id: string; version: number };
interface Props { existing?: Invoice; customers?: Customer[] }
const invoice: Invoice = { id: "invoice-1", version: 1, customer_id: "customer-1", customer_name: "QA", notes: "Original", line_items: [{ ...EMPTY_LINE, description: "Renta" }] };
const customer: Customer = { id: "customer-1", name: "QA", rfc: "XAXX010101000", razon_social: "QA fiscal", regimen_fiscal: "616", domicilio_fiscal_cp: "64000", uso_cfdi: "S01" };
function setup(initialProps: Props) {
  return renderHook(({ existing, customers }: Props) => {
    const form = useForm<InvoiceFormValues>({ defaultValues: buildEmptyInvoiceValues() });
    const version = useInitialRecordVersion(existing?.id, existing?.id, existing?.version);
    useInvoicePrefill({ form, existing, customers, sourceQuote: undefined, assignments: undefined, forklifts: undefined, isEdit: true });
    return { form, version };
  }, { initialProps });
}

describe("D2: invoice prefill uses document identity and selected customer fiscal data", () => {
  it("fills a missing RFC when the same customer changes inside an equal-length array", () => {
    const { result, rerender } = setup({ existing: invoice, customers: [{ id: customer.id, name: customer.name }] });
    expect(result.current.form.getValues("cfdi.receptorRfc")).toBe("");
    rerender({ existing: invoice, customers: [{ ...customer }] });
    expect(result.current.form.getValues("cfdi")).toMatchObject({ receptorRfc: customer.rfc, receptorRazonSocial: "QA fiscal", receptorRegimenFiscal: "616", receptorDomicilioFiscalCp: "64000", usoCfdi: "S01" });
  });

  it("hydrates data arriving after the invoice without losing manually edited fields or rows", () => {
    const { result, rerender } = setup({ existing: invoice, customers: undefined });
    const manual = { ...EMPTY_LINE, description: "Manual", unit_price: 42, total: 42 };
    act(() => {
      result.current.form.setValue("notes", "Edited", { shouldDirty: true });
      result.current.form.setValue("lineItems", [manual], { shouldDirty: true });
      result.current.form.setValue("cfdi.receptorRfc", "XEXX010101000", { shouldDirty: true });
      result.current.form.setValue("cfdi.usoCfdi", "G01", { shouldDirty: true });
    });
    rerender({ existing: { ...invoice }, customers: [customer] });
    expect(result.current.form.getValues()).toMatchObject({ notes: "Edited", lineItems: [manual], cfdi: { receptorRfc: "XEXX010101000", usoCfdi: "G01", receptorRegimenFiscal: "616" } });
    expect(result.current.form.getFieldState("notes").isDirty).toBe(true);
    expect(result.current.form.getFieldState("cfdi.receptorRfc").isDirty).toBe(true);
  });

  it("does not overwrite a touched empty field or fields belonging to a different selected customer", () => {
    const { result, rerender } = setup({ existing: invoice, customers: undefined });
    act(() => result.current.form.setValue("cfdi.receptorRfc", "", { shouldTouch: true }));
    rerender({ existing: invoice, customers: [customer] });
    expect(result.current.form.getValues("cfdi.receptorRfc")).toBe("");
    act(() => {
      result.current.form.setValue("customerId", "another-customer", { shouldDirty: true });
      result.current.form.setValue("cfdi.receptorDomicilioFiscalCp", "");
    });
    rerender({ existing: invoice, customers: [{ ...customer, domicilio_fiscal_cp: "65000" }] });
    expect(result.current.form.getValues("cfdi.receptorDomicilioFiscalCp")).toBe("");
  });

  it("preserves a historical fiscal snapshot, including blanks, and partial stored fields", () => {
    const historical = { ...invoice, receptor_rfc: "XEXX010101000", receptor_razon_social: "Histórica", receptor_regimen_fiscal: "", uso_cfdi: "G01" };
    const { result, rerender } = setup({ existing: historical, customers: [customer] });
    rerender({ existing: { ...historical }, customers: [{ ...customer, razon_social: "Changed" }] });
    expect(result.current.form.getValues("cfdi")).toMatchObject({ receptorRfc: "XEXX010101000", receptorRazonSocial: "Histórica", receptorRegimenFiscal: "", usoCfdi: "G01" });
    rerender({ existing: { ...invoice, id: "invoice-partial", receptor_razon_social: "Guardada", uso_cfdi: "G01" }, customers: [customer] });
    expect(result.current.form.getValues("cfdi")).toMatchObject({ receptorRfc: customer.rfc, receptorRazonSocial: "Guardada", usoCfdi: "G01" });
  });

  it("refreshes catalog-derived values without resetting the draft or advancing the optimistic version", () => {
    const { result, rerender } = setup({ existing: invoice, customers: [customer] });
    act(() => result.current.form.setValue("notes", "Local edit", { shouldDirty: true }));
    rerender({ existing: { ...invoice, version: 2, notes: "Remote edit" }, customers: [{ ...customer, rfc: "XEXX010101000" }, { id: "other", name: "Other" }] });
    expect(result.current.form.getValues("notes")).toBe("Local edit");
    expect(result.current.form.getValues("cfdi.receptorRfc")).toBe("XEXX010101000");
    expect(result.current.version).toBe(1);
  });

  it("refreshes only unchanged automatic fields, not manual dirty/touched values or external edits", () => {
    const { result, rerender } = setup({ existing: invoice, customers: [customer] });
    act(() => {
      result.current.form.setValue("cfdi.receptorRazonSocial", "Manual", { shouldDirty: true });
      result.current.form.setValue("cfdi.receptorDomicilioFiscalCp", "64000", { shouldTouch: true });
      // Another form handler may write without marking dirty; provenance still protects it.
      result.current.form.setValue("cfdi.receptorRegimenFiscal", "601");
    });
    rerender({ existing: invoice, customers: [{ ...customer, rfc: "XEXX010101000", razon_social: "Updated catalog", domicilio_fiscal_cp: "65000", regimen_fiscal: "612" }] });
    expect(result.current.form.getValues("cfdi")).toMatchObject({ receptorRfc: "XEXX010101000", receptorRazonSocial: "Manual", receptorDomicilioFiscalCp: "64000", receptorRegimenFiscal: "601" });
    expect(result.current.form.getFieldState("cfdi.receptorRazonSocial").isDirty).toBe(true);
    expect(result.current.form.getFieldState("cfdi.receptorDomicilioFiscalCp").isTouched).toBe(true);
  });

  it("keeps the initially saved fiscal snapshot and its blanks when a same-ID refetch loses the RFC", () => {
    const historical = { ...invoice, receptor_rfc: "XEXX010101000", receptor_razon_social: "Guardada", receptor_regimen_fiscal: "", receptor_domicilio_fiscal_cp: "", uso_cfdi: "" };
    const { result, rerender } = setup({ existing: historical, customers: undefined });
    const original = { ...result.current.form.getValues("cfdi") };
    rerender({ existing: { ...historical, version: 2, receptor_rfc: null, receptor_razon_social: null }, customers: [customer] });
    expect(result.current.form.getValues("cfdi")).toEqual(original);
    expect(result.current.version).toBe(1);
  });

  it("keeps partial saved fields protected even when a same-ID refetch drops them", () => {
    const partial = { ...invoice, receptor_razon_social: "Guardada", uso_cfdi: "G01" };
    const { result, rerender } = setup({ existing: partial, customers: undefined });
    rerender({ existing: { ...partial, receptor_razon_social: null, uso_cfdi: null }, customers: [customer] });
    expect(result.current.form.getValues("cfdi")).toMatchObject({ receptorRfc: customer.rfc, receptorRazonSocial: "Guardada", usoCfdi: "G01" });
  });

  it("treats explicitly empty usage consistently for initial and late customer data", () => {
    const missingUsage = { ...invoice, uso_cfdi: "" };
    const initial = setup({ existing: missingUsage, customers: [customer] });
    const late = setup({ existing: missingUsage, customers: undefined });
    expect(late.result.current.form.getValues("cfdi.usoCfdi")).toBe("");
    late.rerender({ existing: missingUsage, customers: [customer] });
    expect(late.result.current.form.getValues("cfdi.usoCfdi")).toBe("S01");
    expect(late.result.current.form.getValues("cfdi")).toEqual(initial.result.current.form.getValues("cfdi"));
  });

  it("clears prior provenance and saved-snapshot protection when switching documents", () => {
    const { result, rerender } = setup({ existing: { ...invoice, receptor_rfc: "XEXX010101000", receptor_razon_social: "Historical" }, customers: [customer] });
    act(() => result.current.form.setValue("cfdi.receptorRazonSocial", "Edited historical", { shouldDirty: true }));
    const second = { ...invoice, id: "invoice-2", uso_cfdi: "" };
    rerender({ existing: second, customers: undefined });
    expect(result.current.form.getValues("cfdi.receptorRazonSocial")).toBe("");
    expect(result.current.form.getFieldState("cfdi.receptorRazonSocial").isDirty).toBe(false);
    rerender({ existing: second, customers: [customer] });
    expect(result.current.form.getValues("cfdi")).toMatchObject({ receptorRfc: customer.rfc, receptorRazonSocial: "QA fiscal", usoCfdi: "S01" });
    rerender({ existing: second, customers: [{ ...customer, razon_social: "New automatic name" }] });
    expect(result.current.form.getValues("cfdi.receptorRazonSocial")).toBe("New automatic name");
  });

  it("initially hydrates an asynchronous invoice and resets only when the document changes", () => {
    const { result, rerender } = setup({ existing: undefined, customers: [customer] });
    rerender({ existing: invoice, customers: [customer] });
    expect(result.current.form.getValues("notes")).toBe("Original");
    act(() => result.current.form.setValue("notes", "Dirty first document", { shouldDirty: true }));
    rerender({ existing: { ...invoice, id: "invoice-2", version: 4, notes: "Second document", receptor_rfc: "XEXX010101000" }, customers: [customer] });
    expect(result.current.form.getValues("notes")).toBe("Second document");
    expect(result.current.form.getValues("cfdi.receptorRfc")).toBe("XEXX010101000");
    expect(result.current.form.getFieldState("notes").isDirty).toBe(false);
    expect(result.current.version).toBe(4);
  });
});
