import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookingFormSummary } from "../BookingFormSummary";

const base = { customerName: "Cliente de maniobras industriales de nombre largo", forkliftName: "MTY Equipo sintético de nombre largo", recurringBilling: false };

describe("BookingFormSummary", () => {
  it("muestra los nombres completos y un periodo inclusivo sin inventar importes", () => {
    render(<BookingFormSummary {...base} startDate={new Date(2026, 10, 1)} endDate={new Date(2026, 10, 7)} recurringBilling />);
    expect(screen.getByText(base.customerName)).toBeVisible();
    expect(screen.getByText(base.forkliftName)).toBeVisible();
    expect(screen.getByText("01/11/2026 – 07/11/2026")).toBeVisible();
    expect(screen.getByText("7 días de renta · fin incluido")).toBeVisible();
    expect(screen.getByText("Incluida en facturación mensual")).toBeVisible();
    expect(screen.queryByText(/subtotal|total|IVA|MXN|USD/i)).not.toBeInTheDocument();
  });

  it("cuenta la renta del mismo día como un día", () => {
    render(<BookingFormSummary {...base} startDate={new Date(2026, 10, 1)} endDate={new Date(2026, 10, 1)} />);
    expect(screen.getByText("1 día de renta · fin incluido")).toBeVisible();
  });

  it.each([
    { startDate: undefined, endDate: undefined },
    { startDate: new Date(2026, 10, 7), endDate: undefined },
    { startDate: new Date(2026, 10, 7), endDate: new Date(2026, 10, 1) },
  ])("no inventa días con fechas incompletas o invertidas: %o", (period) => {
    render(<BookingFormSummary {...base} {...period} />);
    expect(screen.queryByText(/días? de renta/)).not.toBeInTheDocument();
  });
});
