import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DatePickerField } from "../DatePickerField";
import { DateRangePickerField } from "../DateRangePickerField";
import type { DateRange } from "react-day-picker";

function SingleDate({ required = false }: { required?: boolean }) {
  const [date, setDate] = useState<Date | undefined>(new Date(2026, 9, 20));
  return <><DatePickerField label="Fecha QA" required={required} date={date} onSelect={setDate} />
    <output data-testid="value">{date ? "con fecha" : "sin fecha"}</output></>;
}
function RangeDate({ required = false }: { required?: boolean }) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: new Date(2026, 9, 20), to: new Date(2026, 9, 21) });
  return <><DateRangePickerField label="Rango QA" required={required} dateRange={dateRange} onSelect={setDateRange} />
    <output data-testid="value">{dateRange?.from ? "con rango" : "sin rango"}</output></>;
}

describe("UX01: limpiar calendario con confirmación", () => {
  it.each(["Fecha QA", "Rango QA"])("%s opcional permite aplicar un vaciado y reabrir vacío", (label) => {
    render(label === "Fecha QA" ? <SingleDate /> : <RangeDate />);
    fireEvent.click(screen.getByRole("button", { name: `Abrir calendario de ${label}` }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Limpiar" }));
    expect(within(dialog).getByRole("button", { name: "Aplicar" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Aplicar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("value")).toHaveTextContent(/^sin /);
    for (const input of screen.getAllByRole("textbox")) expect(input).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: `Abrir calendario de ${label}` }));
    expect(screen.getByRole("button", { name: "Limpiar" })).toBeDisabled();
  });

  it.each(["Fecha QA", "Rango QA"])("%s cancelar no aplica la limpieza", (label) => {
    render(label === "Fecha QA" ? <SingleDate /> : <RangeDate />);
    fireEvent.click(screen.getByRole("button", { name: `Abrir calendario de ${label}` }));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByTestId("value")).toHaveTextContent(/^con /);
    expect(screen.getAllByRole("textbox")[0]).toHaveValue("20/10/2026");
  });

  it.each(["Fecha QA", "Rango QA"])("%s requerido no aplica una limpieza", (label) => {
    render(label === "Fecha QA" ? <SingleDate required /> : <RangeDate required />);
    fireEvent.click(screen.getByRole("button", { name: `Abrir calendario de ${label}` }));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
  });

  it("permite limpiar un rango opcional que sólo tiene fecha de fin", () => {
    const onSelect = vi.fn();
    render(<DateRangePickerField label="Rango QA" dateRange={{ from: undefined, to: new Date(2026, 9, 20) }} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario de Rango QA" }));
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it("un rango parcial opcional no se confunde con un vaciado", () => {
    render(<DateRangePickerField label="Rango QA" dateRange={{ from: new Date(2026, 9, 20) }} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario de Rango QA" }));
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
  });
});

describe("UX02: accesibilidad del error de rango", () => {
  it("relaciona ambos campos con un solo mensaje de dominio y elimina el estado al corregir", () => {
    const { rerender } = render(<DateRangePickerField label="Fechas de reserva" required error="Selecciona la fecha de inicio" onSelect={vi.fn()} />);
    const error = screen.getByText("Selecciona la fecha de inicio");
    expect(error).toBeVisible();
    expect(error.id).toBeTruthy();
    for (const input of screen.getAllByRole("textbox")) {
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
      expect(input).toHaveAccessibleDescription("Selecciona la fecha de inicio");
    }
    rerender(<DateRangePickerField label="Fechas de reserva" helperText="Elige inicio y fin" onSelect={vi.fn()} />);
    for (const input of screen.getAllByRole("textbox")) {
      expect(input).not.toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAccessibleDescription("Elige inicio y fin");
    }
  });

  it("conserva juntos el error del rango y el error propio de la captura", () => {
    render(<DateRangePickerField label="Rango QA" error="Revisa el rango" onSelect={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Rango QA — inicio" });
    fireEvent.change(input, { target: { value: "31/02/2026" } });
    expect(input).toHaveAccessibleDescription("Revisa el rango 31/02/2026 no existe");
    expect(screen.getAllByText("Revisa el rango")).toHaveLength(1);
  });
});
