import { useEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { Form } from "@/components/ui/form";
import { buildFromInvoice, type ExistingInvoice } from "../../../hooks/invoiceForm/invoiceFormBuilders";
import { useInvoiceFormSubmit } from "../../../hooks/invoiceForm/useInvoiceFormSubmit";
import { buildEmptyInvoiceValues, invoiceFormSchema, type InvoiceFormValues } from "../../../lib/invoiceFormSchema";
import { CfdiFieldsCard } from "../CfdiFieldsCard";
import { EditableLineItemsTable } from "../EditableLineItemsTable";

afterEach(cleanup);

// Transport hooks are unused; the real payload builder and Select stay mounted.
vi.mock("@/features/quotes", () => ({ useUpdateQuote: () => ({}) }));
vi.mock("../../../hooks/invoices/useInvoices", () => ({
  useSaveInvoiceWithBookings: () => ({ isPending: false }),
}));

const existingUsd: ExistingInvoice = {
  customer_id: "synthetic-customer",
  customer_name: "Synthetic USD customer",
  line_items: [{ description: "Synthetic rental", quantity: 1, unit_price: 100, total: 100 }],
  tax_rate: 0,
  issued_at: "2026-10-19",
  forma_pago: "99",
  metodo_pago: "PPD",
  uso_cfdi: "G03",
  moneda: "USD",
  tipo_cambio: 17.5,
  receptor_rfc: "AAA010101AAA",
  receptor_razon_social: "SYNTHETIC CUSTOMER",
  receptor_regimen_fiscal: "601",
  receptor_domicilio_fiscal_cp: "06600",
};

type Trace = { kind: string; name?: string; value?: string; moneda?: string };
type Payload = ReturnType<ReturnType<typeof useInvoiceFormSubmit>["buildPayload"]>;

function Harness({ existing, onSubmit, onPayload, trace }: {
  existing?: ExistingInvoice;
  onSubmit: (values: InvoiceFormValues) => void;
  onPayload?: (payload: Payload) => void;
  trace: Trace[];
}) {
  const form = useForm<InvoiceFormValues>({
    defaultValues: buildEmptyInvoiceValues(),
    resolver: zodResolver(invoiceFormSchema),
  });
  const { buildPayload } = useInvoiceFormSubmit();
  const cfdi = useWatch({ control: form.control, name: "cfdi" });
  useEffect(() => {
    // This subscription records reset/native events without changing the fields.
    // eslint-disable-next-line react-hooks/incompatible-library
    const subscription = form.watch((values, event) => {
      trace.push({ kind: "watch", name: event.name, moneda: values.cfdi?.moneda });
    });
    return () => subscription.unsubscribe();
  }, [form, trace]);
  useEffect(() => {
    if (!existing) return;
    const values = buildFromInvoice(existing, undefined);
    trace.push({ kind: "reset", moneda: values.cfdi.moneda });
    form.reset(values);
  }, [existing, form, trace]);
  return (
    <Form {...form}>
      <form aria-label="Synthetic invoice form" onSubmit={form.handleSubmit((values) => {
        onSubmit(values);
        onPayload?.(buildPayload({ values, isEdit: true, fromQuoteId: null }));
      }, (errors) => {
        trace.push({ kind: "validation-errors", value: JSON.stringify(Object.keys(errors)) });
      })} onChangeCapture={(event) => {
        if (event.target instanceof HTMLSelectElement) {
          trace.push({ kind: "native-select-change", name: event.target.name, value: event.target.value });
        }
      }}>
        <EditableLineItemsTable />
        <CfdiFieldsCard />
        <output aria-label="CFDI values">{JSON.stringify(cfdi)}</output>
        <button type="submit">Guardar factura sintética</button>
      </form>
    </Form>
  );
}

describe("CfdiFieldsCard existing USD invoice prefill", () => {
  it("keeps the visible USD currency and amounts when cached invoice is present at mount", async () => {
    const trace: Trace[] = [];
    render(<Harness existing={existingUsd} onSubmit={vi.fn()} trace={trace} />);
    await waitFor(() => expect(screen.getByLabelText("Tipo de Cambio")).toHaveValue(17.5));
    // eslint-disable-next-line no-console -- Synthetic trace retained for before/after evidence.
    console.log("synthetic-prefill-trace", "cached", JSON.stringify(trace));
    const values = JSON.parse(screen.getByLabelText("CFDI values").textContent ?? "{}");
    expect(values.moneda).toBe("USD");
    expect(screen.getByRole("combobox", { name: "Moneda" })).toHaveTextContent(/USD|Dólar/);
    expect(screen.getByLabelText("Importe neto partida 1")).toHaveTextContent(/US\$|USD/);
  });

  it.each(["cached", "after mount"] as const)("submits USD fiscal metadata without changing amounts when invoice loads %s", async (load) => {
    const trace: Trace[] = [];
    const onSubmit = vi.fn();
    const onPayload = vi.fn();
    const view = render(<Harness existing={load === "cached" ? existingUsd : undefined} onSubmit={onSubmit} onPayload={onPayload} trace={trace} />);
    if (load === "after mount") {
      view.rerender(<Harness existing={existingUsd} onSubmit={onSubmit} onPayload={onPayload} trace={trace} />);
    }
    await waitFor(() => expect(screen.getByLabelText("Tipo de Cambio")).toHaveValue(17.5));
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Razón Social"), { target: { value: "SYNTHETIC CUSTOMER EDITED" } });
    fireEvent.submit(screen.getByRole("form", { name: "Synthetic invoice form" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    // eslint-disable-next-line no-console -- Synthetic payload retained for before/after evidence.
    console.log("synthetic-submit", load, JSON.stringify({ trace, payload: onPayload.mock.calls[0][0] }));
    expect(onPayload.mock.calls[0][0]).toMatchObject({
      moneda: "USD", tipo_cambio: 17.5, metodo_pago: "PPD", forma_pago: "99", uso_cfdi: "G03",
      receptor_rfc: "AAA010101AAA", receptor_razon_social: "SYNTHETIC CUSTOMER EDITED",
      receptor_regimen_fiscal: "601", receptor_domicilio_fiscal_cp: "06600",
      subtotal: 100, tax_amount: 0, total: 100,
      line_items: [expect.objectContaining({ description: "Synthetic rental", quantity: 1, unit_price: 100, total: 100 })],
    });
    expect(onSubmit.mock.calls[0][0].cfdi).toMatchObject({
      moneda: "USD", tipoCambio: 17.5, metodoPago: "PPD", formaPago: "99", usoCfdi: "G03",
      receptorRazonSocial: "SYNTHETIC CUSTOMER EDITED",
    });
  });

  it("still applies deliberate native Select choices for MXN, PPD and EUR", async () => {
    const trace: Trace[] = [];
    const onPayload = vi.fn();
    const view = render(<Harness onSubmit={vi.fn()} onPayload={onPayload} trace={trace} />);
    view.rerender(<Harness existing={existingUsd} onSubmit={vi.fn()} onPayload={onPayload} trace={trace} />);
    await waitFor(() => expect(screen.getByLabelText("Tipo de Cambio")).toHaveValue(17.5));
    const nativeSelect = (value: string) => {
      const select = Array.from(view.container.querySelectorAll("select")).find((element) => element.value === value);
      if (!select) throw new Error(`Missing real native Select for ${value}`);
      return select;
    };
    fireEvent.change(nativeSelect("USD"), { target: { value: "MXN" } });
    expect(JSON.parse(screen.getByLabelText("CFDI values").textContent ?? "{}")).toMatchObject({ moneda: "MXN", tipoCambio: 1 });
    expect(screen.queryByLabelText("Tipo de Cambio")).not.toBeInTheDocument();
    fireEvent.change(nativeSelect("PPD"), { target: { value: "PUE" } });
    expect(screen.getByRole("combobox", { name: "Forma de Pago" })).not.toBeDisabled();
    fireEvent.change(nativeSelect("PUE"), { target: { value: "PPD" } });
    expect(screen.getByRole("combobox", { name: "Forma de Pago" })).toBeDisabled();
    expect(JSON.parse(screen.getByLabelText("CFDI values").textContent ?? "{}")).toMatchObject({ metodoPago: "PPD", formaPago: "99" });
    fireEvent.change(nativeSelect("MXN"), { target: { value: "EUR" } });
    fireEvent.change(screen.getByLabelText("Tipo de Cambio"), { target: { value: "18.5" } });
    fireEvent.submit(screen.getByRole("form", { name: "Synthetic invoice form" }));
    await waitFor(() => expect(onPayload).toHaveBeenCalledOnce());
    expect(onPayload.mock.calls[0][0]).toMatchObject({ moneda: "EUR", tipo_cambio: 18.5, metodo_pago: "PPD", forma_pago: "99", total: 100 });
  });
});
