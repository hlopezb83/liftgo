/**
 * Bloque 19a (R7): FormMessage no debe renderizar "undefined" cuando el error
 * viene como objeto anidado (arrays con errores por índice) sin `.message` raíz.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormMessage } from "@/components/ui/form";

type Values = { items: { name: string }[] };

function Harness({ error }: { error: unknown }) {
  const form = useForm<Values>({ defaultValues: { items: [{ name: "" }] } });
  // Inyectamos error manualmente para simular Zod arrays con issues por índice.
  form.setError("items", error as Parameters<typeof form.setError>[1]);
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="items"
        render={() => (
          <FormItem>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  );
}

describe("FormMessage", () => {
  it("no renderiza 'undefined' cuando el error es un array con issues anidados", () => {
    render(
      <Harness
        error={{
          "0": { name: { type: "custom", message: "El nombre es requerido" } },
        }}
      />,
    );
    expect(screen.queryByText("undefined")).toBeNull();
    expect(screen.getByText("El nombre es requerido")).toBeInTheDocument();
  });

  it("prefiere el mensaje raíz cuando existe", () => {
    render(<Harness error={{ type: "custom", message: "Agrega al menos una partida" }} />);
    expect(screen.getByText("Agrega al menos una partida")).toBeInTheDocument();
  });
});
