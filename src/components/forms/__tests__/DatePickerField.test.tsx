import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DatePickerField } from "../DatePickerField";

function Field({ initialDate = new Date(2026, 9, 28) }: { initialDate?: Date }) {
  const [date, setDate] = useState<Date | undefined>(initialDate);
  return <DatePickerField label="Nueva fecha de fin" date={date} onSelect={setDate} />;
}

describe("DatePickerField: mes de la fecha vigente", () => {
  it("abre el mes seleccionado, deja navegar y vuelve a la selección al reabrir", async () => {
    render(<Field />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario de Nueva fecha de fin" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("grid", { name: "octubre 2026" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Ir al mes siguiente" }));
    expect(within(dialog).getByRole("grid", { name: "noviembre 2026" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario de Nueva fecha de fin" }));
    expect(within(await screen.findByRole("dialog")).getByRole("grid", { name: "octubre 2026" })).toBeInTheDocument();
  });

  it("usa el mes de una fecha capturada por teclado al abrir", async () => {
    render(<Field />);
    fireEvent.change(screen.getByLabelText("Nueva fecha de fin"), { target: { value: "14022027" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario de Nueva fecha de fin" }));
    expect(within(await screen.findByRole("dialog")).getByRole("grid", { name: "febrero 2027" })).toBeInTheDocument();
  });
});
