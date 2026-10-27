import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EquipmentModel } from "@/features/fleet";
import { RentalLineRow } from "../RentalLineRow";
import type { RentalLine } from "../RentalLineItems";
import { SaleLineRow } from "../SaleLineRow";
import type { SaleLine } from "../SaleLineItems";

const fullModelName = "Marca ficticia QA - Modelo de nombre muy largo para maniobras de almacén y carga industrial 2500";
const models = [{
  id: "model-fixture",
  manufacturer: "Marca ficticia QA",
  model: "Modelo de nombre muy largo para maniobras de almacén y carga industrial 2500",
}] as EquipmentModel[];

const sale: SaleLine = {
  modelId: "model-fixture", quantity: 2, unitPrice: 125000, discount: 10, discountType: "%",
};
const rental: RentalLine = {
  modelId: "model-fixture", quantity: 2, dailyRate: 1000, weeklyRate: 5000,
  monthlyRate: 15000, discount: 10, discountType: "%",
};
const startDate = new Date("2026-11-01T12:00:00Z");
const endDate = new Date("2026-11-30T12:00:00Z");

afterEach(cleanup);

function saleProps() {
  return { line: sale, index: 2, models, disableRemove: false, onUpdate: vi.fn(), onRemove: vi.fn() };
}
function rentalProps() {
  return {
    line: rental, index: 1, models, disableRemove: false, startDate, endDate,
    onUpdate: vi.fn(), onModelChange: vi.fn(), onRemove: vi.fn(),
  };
}

describe("Quote line rows display the selected currency without converting values", () => {
  it.each([
    { currency: "MXN", discountType: "%" as const, discount: 10, formatted: "$225,000.00" },
    { currency: "USD", discountType: "%" as const, discount: 10, formatted: "USD 225,000.00" },
    { currency: "MXN", discountType: "$" as const, discount: 250, formatted: "$249,750.00" },
    { currency: "USD", discountType: "$" as const, discount: 250, formatted: "USD 249,750.00" },
  ])("shows the sale net for $currency with $discountType discount", ({ currency, discountType, discount, formatted }) => {
    const props = saleProps();
    render(<SaleLineRow {...props} line={{ ...sale, discount, discountType }} currency={currency} />);
    expect(screen.getByText(formatted)).toBeVisible();
    expect(screen.getByText(currency, { exact: true })).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: `Precio Unit. (${currency})` })).toHaveValue(125000);
    expect(screen.getByRole("spinbutton", { name: "Cantidad" })).toHaveValue(2);
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it.each([
    { currency: "MXN", discountType: "%" as const, discount: 10, formatted: "$27,000.00" },
    { currency: "USD", discountType: "%" as const, discount: 10, formatted: "USD 27,000.00" },
    { currency: "MXN", discountType: "$" as const, discount: 500, formatted: "$29,500.00" },
    { currency: "USD", discountType: "$" as const, discount: 500, formatted: "USD 29,500.00" },
  ])("shows the monthly rental estimate for $currency with $discountType discount", ({ currency, discountType, discount, formatted }) => {
    const props = rentalProps();
    render(<RentalLineRow {...props} line={{ ...rental, discount, discountType }} currency={currency} />);
    expect(screen.getByText(formatted)).toBeVisible();
    expect(screen.getByText(`Total estimado ${currency}`)).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: `Tarifa Mensual (${currency})` })).toHaveValue(15000);
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it("changes only the sale currency label when the selected currency changes", () => {
    const props = saleProps();
    const { rerender } = render(<SaleLineRow {...props} currency="MXN" />);
    expect(screen.getByText("$225,000.00")).toBeVisible();
    rerender(<SaleLineRow {...props} currency="USD" />);
    expect(screen.getByText("USD 225,000.00")).toBeVisible();
    expect(screen.queryByText("$225,000.00")).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Precio Unit. (USD)" })).toHaveValue(125000);
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it("preserves a historical rental amount and full description without dates or a model", () => {
    const props = rentalProps();
    const legacyDescription = "Renta histórica ficticia pactada con descripción completa";
    render(<RentalLineRow
      {...props}
      currency="USD"
      startDate={undefined}
      endDate={undefined}
      line={{ ...rental, modelId: "", quantity: 2, legacyTotal: 123.45, legacyDescription, discount: 0 }}
    />);
    expect(screen.getByText("USD 246.90")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Modelo *" })).toHaveAccessibleDescription(legacyDescription);
    expect(screen.getByText(legacyDescription)).toBeVisible();
    expect(props.onUpdate).not.toHaveBeenCalled();
    expect(props.onModelChange).not.toHaveBeenCalled();
  });
});

describe("Quote line fields keep accessible identity and update handlers", () => {
  it("exposes the complete sale model and connected quantity/price/discount labels", () => {
    const props = saleProps();
    render(<SaleLineRow {...props} currency="USD" />);
    expect(screen.getByRole("group", { name: "Equipo de venta 3" })).toBeInTheDocument();
    const model = screen.getByRole("combobox", { name: "Modelo *" });
    expect(model).toHaveAccessibleDescription(fullModelName);
    expect(document.getElementById(model.getAttribute("aria-describedby")!)).toBeVisible();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Cantidad" }), { target: { value: "3" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Precio Unit. (USD)" }), { target: { value: "99.99" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Descuento" }), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("radio", { name: "Descuento en USD" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar línea" }));
    expect(props.onUpdate.mock.calls).toEqual([
      [2, "quantity", 3], [2, "unitPrice", 99.99], [2, "discount", 12.5], [2, "discountType", "$"],
    ]);
    expect(props.onRemove).toHaveBeenCalledWith(2);
  });

  it("exposes the complete rental model and connects every rate label to its input", () => {
    const props = rentalProps();
    render(<RentalLineRow {...props} currency="USD" />);
    expect(screen.getByRole("group", { name: "Equipo de renta 2" })).toBeInTheDocument();
    const model = screen.getByRole("combobox", { name: "Modelo *" });
    expect(model).toHaveAccessibleDescription(fullModelName);
    expect(document.getElementById(model.getAttribute("aria-describedby")!)).toBeVisible();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Cantidad" }), { target: { value: "4" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Tarifa Diaria (USD)" }), { target: { value: "101.25" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Tarifa Semanal (USD)" }), { target: { value: "505.5" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Tarifa Mensual (USD)" }), { target: { value: "1505.75" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Descuento" }), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("radio", { name: "Descuento en USD" }));
    expect(props.onUpdate.mock.calls).toEqual([
      [1, "quantity", 4], [1, "dailyRate", 101.25], [1, "weeklyRate", 505.5],
      [1, "monthlyRate", 1505.75], [1, "discount", 100], [1, "discountType", "$"],
    ]);
  });
});
