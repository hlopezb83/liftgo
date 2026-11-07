import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useForm, useWatch } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Form } from "@/components/ui/form";
import { useInvoiceFormHandlers } from "../../../hooks/invoiceForm/useInvoiceFormHandlers";
import { buildEmptyInvoiceValues } from "../../../lib/invoiceFormSchema";
import { InvoiceDetailsCard } from "../InvoiceDetailsCard";
import type { Customer } from "../../../hooks/invoiceForm/invoiceFormBuilders";

afterEach(cleanup);

const mocks = vi.hoisted(() => ({
  remote: {} as Record<string, unknown>,
  detail: undefined as Record<string, unknown> | undefined,
}));
vi.mock("@/features/customers", async () => ({
  CustomerSelector: (await import("@/features/customers/components/customers/CustomerSelector")).CustomerSelector,
}));
vi.mock("@/features/customers/hooks/customers/customerQueries", () => ({
  useCustomer: () => ({ data: mocks.detail }),
  useCustomerSelectorSearch: (term: string, open: boolean) => ({
    data: open && term.length >= 2 ? { customers: [mocks.remote], isTruncated: false } : undefined,
    isSearchPending: false, isFetching: false, isError: false,
  }),
}));
vi.mock("../../../hooks/invoices/useNextInvoiceNumber", () => ({ useNextInvoiceNumber: () => ({ data: "TEST" }) }));

const initial: Customer = { id: "a", name: "Cliente anterior", rfc: "AAA010101AAA", razon_social: "Anterior SA",
  regimen_fiscal: "601", domicilio_fiscal_cp: "64000", uso_cfdi: "I03", tax_rate: 8 };
const initialCustomers = [initial];
// Exercise the real capped-list boundary once; receiver-state cases do not need
// to repeatedly mount 500 unrelated cmdk options just to select a remote DTO.
const cappedCustomers = [initial, ...Array.from({ length: 500 }, (_, i) => ({ id: `filler-${i}`, name: `Cliente ${i}` }))];
function Harness({ customers = initialCustomers }: { customers?: Customer[] }) {
  const values = buildEmptyInvoiceValues();
  values.customerId = initial.id;
  values.customerName = initial.name;
  values.taxRate = 8;
  Object.assign(values.cfdi, { receptorRfc: initial.rfc, receptorRazonSocial: initial.razon_social,
    receptorRegimenFiscal: "601", receptorDomicilioFiscalCp: "64000", usoCfdi: "I03", moneda: "USD", tipoCambio: 19 });
  const form = useForm({ defaultValues: values });
  const handlers = useInvoiceFormHandlers({ form, customers, bookings: [], forklifts: [],
    loadQuoteCharges: vi.fn() });
  const state = useWatch({ control: form.control });
  return <Form {...form}><InvoiceDetailsCard isEdit form={form} customers={customers} availableBookings={[]}
    handleCustomerSelect={handlers.handleCustomerSelect} handleBookingsChange={handlers.handleBookingsChange} />
    <button type="button" onClick={() => handlers.handleCustomerSelect("")}>Clear receiver</button>
    <output data-testid="state">{JSON.stringify(state)}</output></Form>;
}
function state() { return JSON.parse(screen.getByTestId("state").textContent!); }
async function selectRemote() {
  fireEvent.click(screen.getByRole("combobox", { name: /Cliente/ }));
  fireEvent.change(screen.getByPlaceholderText("Buscar por nombre, razón social o RFC…"), { target: { value: "remoto" } });
  fireEvent.click(await screen.findByRole("option", { name: "Cliente remoto" }));
}
describe("invoice customer selection across the capped list boundary", () => {
  beforeEach(() => { mocks.detail = undefined; mocks.remote = { id: "remote-902", name: "Cliente remoto", rfc: "BBB010101BBB",
    razon_social: "Remoto SA", regimen_fiscal: "612", domicilio_fiscal_cp: "03100", uso_cfdi: "G01", tax_rate: 0 }; });
  it("preserves the saved receiver snapshot until the user selects a customer", () => {
    render(<Harness />);
    expect(state()).toMatchObject({ customerId: "a", taxRate: 8, cfdi: { receptorRfc: "AAA010101AAA",
      receptorRazonSocial: "Anterior SA", receptorRegimenFiscal: "601", receptorDomicilioFiscalCp: "64000", usoCfdi: "I03" } });
  });
  it("keeps the latest remote selection when detail responses arrive out of order", async () => {
    const { rerender } = render(<Harness />);
    const firstRemote = mocks.remote;
    await selectRemote();
    expect(state()).toMatchObject({ customerId: "remote-902", taxRate: 0, cfdi: { receptorRfc: "BBB010101BBB" } });
    mocks.remote = { id: "remote-903", name: "Cliente remoto", rfc: "CCC010101CCC", tax_rate: 8, uso_cfdi: "G02" };
    await selectRemote();
    const latestReceiver = { customerId: "remote-903", taxRate: 8,
      cfdi: { receptorRfc: "CCC010101CCC", usoCfdi: "G02", receptorRegimenFiscal: "", receptorDomicilioFiscalCp: "" } };
    expect(state()).toMatchObject(latestReceiver);
    // The latest detail arrives first, then a stale response for the previous
    // customer. Neither response may overwrite the explicitly selected DTO.
    mocks.detail = mocks.remote;
    rerender(<Harness />);
    expect(state()).toMatchObject(latestReceiver);
    mocks.detail = firstRemote;
    rerender(<Harness />);
    expect(state()).toMatchObject(latestReceiver);
  });
  it("replaces the previous receiver beyond the capped list, including an explicit zero VAT", async () => {
    render(<Harness customers={cappedCustomers} />);
    expect(cappedCustomers).toHaveLength(501);
    expect(screen.getByText(/Hay más clientes en la cartera/)).toBeInTheDocument();
    expect(cappedCustomers.some((customer) => customer.id === mocks.remote.id)).toBe(false);
    await selectRemote();
    expect(state()).toMatchObject({ customerId: "remote-902", customerName: "Cliente remoto", taxRate: 0,
      cfdi: { receptorRfc: "BBB010101BBB", receptorRazonSocial: "Remoto SA", receptorRegimenFiscal: "612",
        receptorDomicilioFiscalCp: "03100", usoCfdi: "G01", moneda: "USD", tipoCambio: 19 } });
  });
  it("clears prior fiscal data and uses defaults when the selected remote customer lacks it", async () => {
    mocks.remote = { id: "remote-902", name: "Cliente remoto", rfc: null, razon_social: null,
      regimen_fiscal: null, domicilio_fiscal_cp: null, uso_cfdi: null, tax_rate: null };
    render(<Harness />);
    await selectRemote();
    expect(state()).toMatchObject({ customerId: "remote-902", taxRate: 16, cfdi: { receptorRfc: "",
      receptorRazonSocial: "Cliente remoto", receptorRegimenFiscal: "", receptorDomicilioFiscalCp: "", usoCfdi: "G03" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear receiver" }));
    expect(state()).toMatchObject({ customerId: "", customerName: "", taxRate: 16,
      cfdi: { receptorRfc: "", receptorRazonSocial: "", receptorRegimenFiscal: "", receptorDomicilioFiscalCp: "", usoCfdi: "G03" } });
  });
});
