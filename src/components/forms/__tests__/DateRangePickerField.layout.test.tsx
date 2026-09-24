import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateRangePickerField } from "../DateRangePickerField";

const selectedRange = {
  from: new Date(2026, 8, 1),
  to: new Date(2026, 8, 30),
};

const viewport = vi.hoisted(() => ({ mobile: true, tabletOrBelow: true }));
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => viewport.mobile,
  useIsTabletOrBelow: () => viewport.tabletOrBelow,
}));

afterEach(() => {
  viewport.mobile = true;
  viewport.tabletOrBelow = true;
});

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
    expect(start.parentElement).toHaveClass("min-w-0", "sm:flex-1");
    expect(end.parentElement).toHaveClass("min-w-0", "sm:flex-1");
    expect(calendar).toHaveClass("h-10", "w-10");
    expect(calendar.parentElement).toContainElement(screen.getByText("Fecha de emisión"));
    expect(controls).toHaveClass("grid", "grid-cols-1", "sm:flex");
  });
  it.each([
    ["tablet", true, 1],
    ["escritorio", false, 2],
  ] as const)("%s abre %i mes(es)", (_name, tabletOrBelow, count) => {
    viewport.mobile = false;
    viewport.tabletOrBelow = tabletOrBelow;
    render(<DateRangePickerField label="Fecha de emisión" onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario de Fecha de emisión" }));

    expect(screen.getAllByRole("table")).toHaveLength(count);
    expect(screen.getByRole("dialog")).toHaveClass("max-w-[22rem]", "lg:max-w-[36rem]");
  });
});
