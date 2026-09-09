import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, it, expect } from "vitest";
import { Form } from "@/components/ui/form";
import { CurrencyField } from "../CurrencyField";

function Harness({ error }: { error?: boolean }) {
  const form = useForm<{ cost: number | null }>({ defaultValues: { cost: null } });
  if (error && !form.formState.errors.cost) {
    form.setError("cost", { type: "manual", message: "Captura el costo" });
  }
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

  it("click en la etiqueta enfoca el input", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Costo"));
    expect(screen.getByRole("textbox", { name: /costo/i })).toHaveFocus();
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
