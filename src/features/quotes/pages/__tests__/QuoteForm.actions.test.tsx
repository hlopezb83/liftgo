// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { QuoteFormValues } from "../../lib/quoteFormSchema";
import QuoteForm from "../QuoteForm";

const fixture = vi.hoisted(() => ({
  id: undefined as string | undefined,
  quoteType: "sale" as "sale" | "rental",
  customerId: "customer-fixture",
  isPending: false,
  isAmountLocked: false,
  chargeIdentityError: null as string | null,
  navigate: vi.fn(),
  submit: vi.fn(),
  invalid: vi.fn(),
}));

vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => fixture.navigate }));

// Only data orchestration is replaced. RHF and the mounted FormActions are real,
// so submitting exercises the actual form context and synchronous click guard.
vi.mock("../../hooks/quoteForm/useQuoteFormLogic", () => ({
  useQuoteFormLogic: function useFixtureQuoteFormLogic() {
    const form = useForm<QuoteFormValues>({
      defaultValues: {
        quoteType: fixture.quoteType,
        customerId: fixture.customerId,
        customerName: "Cliente ficticio",
        currency: "USD",
        tipoCambio: 20,
        taxRate: "16",
        notes: "",
        rentalLines: [],
        saleLines: [],
        includeLogistics: false,
        logisticsCost: 0,
        includeInsurance: false,
        insuranceCost: 0,
      },
    });
    return {
      ...fixture,
      form,
      quoteNumber: "QA-COT-001",
      currency: "USD",
      taxRate: "16",
      customers: [],
      equipmentModels: [],
      equipmentModelsLoading: false,
      includeLogistics: false,
      includeInsurance: false,
      lineItems: [{ description: "Equipo ficticio", quantity: 2, unit_price: 100, total: 200 }],
      subtotal: 200,
      taxAmount: 32,
      total: 232,
      handleSubmit: form.handleSubmit(fixture.submit, fixture.invalid),
      handleTypeChange: vi.fn(),
    };
  },
}));

vi.mock("../../components/quote-form/CustomerField", () => ({
  CustomerField: ({ form }: { form: UseFormReturn<QuoteFormValues> }) => (
    <FormField
      control={form.control}
      name="customerId"
      rules={{ required: "Selecciona un cliente" }}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Cliente ficticio</FormLabel>
          <FormControl><input {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  ),
}));
vi.mock("../../components/quote-form/QuoteTypeCard", () => ({ QuoteTypeCard: () => null }));
vi.mock("../../components/quote-form/QuoteDetailsCard", () => ({ QuoteDetailsCard: () => null }));
vi.mock("../../components/quote-form/LogisticsCard", () => ({ LogisticsCard: () => null }));
vi.mock("../../components/quotes/RentalLineItems", () => ({ RentalLineItems: () => <div>Partidas de renta ficticias</div> }));
vi.mock("../../components/quotes/SaleLineItems", () => ({ SaleLineItems: () => <div>Partidas de venta ficticias</div> }));

beforeEach(() => {
  vi.useFakeTimers();
  fixture.id = undefined;
  fixture.quoteType = "sale";
  fixture.customerId = "customer-fixture";
  fixture.isPending = false;
  fixture.isAmountLocked = false;
  fixture.chargeIdentityError = null;
  fixture.navigate.mockReset();
  fixture.submit.mockReset();
  fixture.invalid.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe("QuoteForm actions remain wired through the persistent footer", () => {
  it.each(["sale", "rental"] as const)("mounts one submit inside the %s form", (quoteType) => {
    fixture.quoteType = quoteType;
    render(<QuoteForm />);
    const buttons = screen.getAllByRole("button", { name: "Crear cotización" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].closest("form")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Cancelar" })).toHaveLength(1);
  });

  it("keeps the edit label and cancel/back navigation", () => {
    fixture.id = "quote-fixture";
    render(<QuoteForm />);
    expect(screen.getByRole("button", { name: "Actualizar cotización" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(fixture.navigate.mock.calls).toEqual([[-1], [-1]]);
    expect(fixture.submit).not.toHaveBeenCalled();
  });

  it("disables both actions during a pending save", () => {
    fixture.isPending = true;
    render(<QuoteForm />);
    const submit = screen.getByRole("button", { name: /^Guardando/ });
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    expect(submit).toBeDisabled();
    expect(cancel).toBeDisabled();
    fireEvent.click(submit);
    fireEvent.click(cancel);
    expect(fixture.submit).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it("shows the charge identity error and blocks submission", () => {
    fixture.chargeIdentityError = "Revisa la identidad del cargo ficticio.";
    render(<QuoteForm />);
    expect(screen.getAllByText(fixture.chargeIdentityError).length).toBeGreaterThan(0);
    const submit = screen.getByRole("button", { name: "Crear cotización" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(fixture.submit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
  });

  it("has no submit action for accepted amounts and retains back navigation", () => {
    fixture.isAmountLocked = true;
    render(<QuoteForm />);
    expect(screen.queryByRole("button", { name: /Crear cotización|Actualizar cotización/ })).not.toBeInTheDocument();
    expect(screen.getByText(/sus montos no pueden modificarse/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(fixture.navigate).toHaveBeenCalledWith(-1);
    expect(fixture.submit).not.toHaveBeenCalled();
  });

  it("keeps the real synchronous double-click guard with only one mounted action set", async () => {
    render(<QuoteForm />);
    const submit = screen.getByRole("button", { name: "Crear cotización" });
    await act(async () => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    await advance(0);
    expect(fixture.submit).toHaveBeenCalledTimes(1);
    expect(fixture.invalid).not.toHaveBeenCalled();
    expect(fixture.submit.mock.calls[0][0]).toMatchObject({ currency: "USD", tipoCambio: 20 });
  });

  it("renders a validation error and permits retry after correcting the field", async () => {
    fixture.customerId = "";
    render(<QuoteForm />);
    const submit = screen.getByRole("button", { name: "Crear cotización" });
    await act(async () => { fireEvent.click(submit); });
    await advance(0);
    expect(screen.getByText("Selecciona un cliente")).toBeVisible();
    expect(fixture.invalid).toHaveBeenCalledTimes(1);
    expect(fixture.submit).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: "Cliente ficticio" }), { target: { value: "customer-fixture" } });
    });
    await advance(1100);
    await act(async () => { fireEvent.click(submit); });
    await advance(0);
    expect(fixture.submit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Selecciona un cliente")).not.toBeInTheDocument();
  });
});
