import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { DateField } from "../DateField";

const schema = z.object({ date: z.date({ error: "Selecciona una fecha válida" }) });
function Field() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { date: new Date(2026, 8, 30) },
  });
  return <Form {...form}><form onSubmit={form.handleSubmit(() => {})}>
    <DateField control={form.control} name="date" label="Fecha de inspección" disabledMatcher={{ after: new Date(2026, 8, 30) }} />
    <button type="submit">Guardar</button>
  </form></Form>;
}

describe("DateField: error de fecha único", () => {
  it("prioriza el motivo del campo sin duplicar el error de schema", async () => {
    render(<Field />);
    const input = screen.getByLabelText("Fecha de inspección");
    fireEvent.change(input, { target: { value: "01102026" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getAllByText("Esta fecha no está permitida")).toHaveLength(1);
    expect(screen.queryByText("Selecciona una fecha válida")).not.toBeInTheDocument();
    expect(screen.queryByText(/Invalid input/)).not.toBeInTheDocument();
  });

  it("explica en español una fecha vacía y la vincula al campo", async () => {
    render(<Field />);
    const input = screen.getByLabelText("Fecha de inspección");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const error = await screen.findByText("Selecciona una fecha válida");
    expect(input).toHaveAttribute("aria-describedby", expect.stringContaining(error.id));
    expect(screen.getAllByText("Selecciona una fecha válida")).toHaveLength(1);
  });

  it("resuelve la captura rechazada al aplicar el mismo día válido desde el calendario", async () => {
    render(<Field />);
    const input = screen.getByLabelText("Fecha de inspección");
    fireEvent.change(input, { target: { value: "01102026" } });
    expect(screen.getByText("Esta fecha no está permitida")).toBeInTheDocument();
    expect(input).toHaveValue("01/10/2026");
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario de Fecha de inspección" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.getByLabelText("Fecha de inspección")).toHaveValue("30/09/2026"));
    expect(screen.queryByText("Esta fecha no está permitida")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Fecha de inspección")).not.toHaveAttribute("aria-invalid", "true");
  });
});
