import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { describe, it, expect } from "vitest";
import { Form } from "@/components/ui/form";
import { CurrencyField } from "../CurrencyField";

function Harness({ error }: { error?: boolean }) {
  const form = useForm<{ cost: number | null }>({ defaultValues: { cost: null } });
  useEffect(() => {
    if (error) form.setError("cost", { type: "manual", message: "Captura el costo" });
  }, [error, form]);
  return (
    <Form {...form}>
      <form>
        <CurrencyField
          control={form.control}
          name="cost"
          label="Costo"
          description="Costo total del servicio"
        />
      </form>
    </Form>
  );
}

describe("V27-05 · CurrencyField asocia etiqueta y descripción al input", () => {
  it("el textbox se identifica por su etiqueta", () => {
    render(<Harness />);
    expect(screen.getByRole("textbox", { name: /costo/i })).toBeInTheDocument();
  });

  it("la etiqueta apunta al input, por lo que el click lo enfoca", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /costo/i });
    const label = screen.getByText("Costo") as HTMLLabelElement;
    // La etiqueta apunta al input (no al contenedor) y el click lo enfoca.
    expect(label.htmlFor).toBe(input.id);
    expect(Array.from((input as HTMLInputElement).labels ?? [])).toContain(label);
  });

  it("la descripción queda asociada al input vía aria-describedby", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /costo/i });
    const description = screen.getByText("Costo total del servicio");
    expect(input.getAttribute("aria-describedby")).toContain(description.id);
  });

  it("el error se asocia al input y lo marca inválido", async () => {
    render(<Harness error />);
    const input = await screen.findByRole("textbox", { name: /costo/i });
    const message = await screen.findByText("Captura el costo");
    expect(input.getAttribute("aria-describedby")).toContain(message.id);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
