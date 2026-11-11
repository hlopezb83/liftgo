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
  it("relaciona el error de inicio sólo con su campo y lo elimina al corregir", () => {
    const { rerender } = render(<DateRangePickerField label="Fechas de reserva" required fromError="Selecciona la fecha de inicio" onSelect={vi.fn()} />);
    const error = screen.getByText("Selecciona la fecha de inicio");
    expect(error).toBeVisible();
    expect(error.id).toBeTruthy();
    const start = screen.getByRole("textbox", { name: "Fechas de reserva — inicio" });
    const end = screen.getByRole("textbox", { name: "Fechas de reserva — fin" });
    expect(start).toHaveAttribute("aria-invalid", "true");
    expect(start).toHaveAccessibleDescription("Selecciona la fecha de inicio");
    expect(end).not.toHaveAttribute("aria-invalid", "true");
    expect(end).not.toHaveAccessibleDescription("Selecciona la fecha de inicio");
    rerender(<DateRangePickerField label="Fechas de reserva" helperText="Elige inicio y fin" onSelect={vi.fn()} />);
    for (const input of screen.getAllByRole("textbox")) {
      expect(input).not.toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAccessibleDescription("Elige inicio y fin");
    }
  });

  it("prioriza la fecha imposible sobre requerido, sin contaminar el campo final", () => {
    render(<DateRangePickerField label="Rango QA" fromError="Fecha de inicio es requerida" toError="Fecha de fin es requerida" onSelect={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Rango QA — inicio" });
    fireEvent.change(input, { target: { value: "31/02/2026" } });
    expect(input).toHaveAccessibleDescription("31/02/2026 no existe");
    expect(screen.queryByText("Fecha de inicio es requerida")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Rango QA — fin" })).toHaveAccessibleDescription("Fecha de fin es requerida");
  });

  it("asocia el error de orden con la fecha de fin", () => {
    render(<DateRangePickerField label="Rango QA" error="El fin no puede ser anterior al inicio" onSelect={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Rango QA — inicio" })).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: "Rango QA — fin" })).toHaveAccessibleDescription("El fin no puede ser anterior al inicio");
  });
});
