import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateRangePickerField } from "../DateRangePickerField";

const selectedRange = {
  from: new Date(2026, 8, 1),
  to: new Date(2026, 8, 30),
};

describe("DateRangePickerField — distribución responsive V26-03", () => {
  it.each([
    ["vacío", undefined, "", ""],
    ["seleccionado", selectedRange, "01/09/2026", "30/09/2026"],
  ] as const)("apila inicio y fin en móvil con rango %s", (_state, dateRange, from, to) => {
    render(
      <DateRangePickerField
        label="Fecha de emisión"
        dateRange={dateRange}
        onSelect={vi.fn()}
      />,
    );

    const start = screen.getByRole("textbox", { name: "Fecha de emisión — inicio" });
    const end = screen.getByRole("textbox", { name: "Fecha de emisión — fin" });
    const calendar = screen.getByRole("button", { name: "Abrir calendario de Fecha de emisión" });
    const controls = start.parentElement?.parentElement;

    expect(start).toHaveValue(from);
    expect(end).toHaveValue(to);
    expect(start.parentElement).toHaveClass("col-start-1", "row-start-1", "min-w-0", "sm:flex-1");
    expect(end.parentElement).toHaveClass("col-start-1", "row-start-2", "min-w-0", "sm:flex-1");
    expect(calendar).toHaveClass("col-start-2", "row-span-2", "h-full", "sm:h-10");
    expect(controls).toHaveClass("grid", "grid-cols-[minmax(0,1fr)_auto]", "sm:flex");
  });
});