import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormErrorSummaryScope } from "@/components/forms/FormErrorSummaryScope";
import { FormErrorSummary } from "../FormErrorSummary";

function Fixture({ save }: { save: () => void }) {
  const form = useForm({ defaultValues: { customer: "", lines: [{ description: "" }] }, shouldFocusError: false });
  return <Form {...form}><FormErrorSummaryScope><form onSubmit={form.handleSubmit(save)}>
    <FormErrorSummary labelFor={(name) => name === "customer" ? "Cliente" : "Partida 1"} />
    <FormField control={form.control} name="customer" rules={{ required: "Selecciona un cliente" }} render={({ field }) =>
      <FormItem><FormLabel>Cliente</FormLabel><div tabIndex={-1}><FormControl><input {...field} /></FormControl></div><FormMessage /></FormItem>} />
    <FormField control={form.control} name="lines.0.description" rules={{ required: "Descripción requerida" }} render={({ field }) =>
      <FormItem><FormLabel>Descripción</FormLabel><FormControl><input {...field} /></FormControl><FormMessage /></FormItem>} />
    <button type="submit">Guardar</button>
  </form></FormErrorSummaryScope></Form>;
}

describe("FormErrorSummary", () => {
  it("enfoca un resumen enlazado al rechazar el envío y no roba foco al corregir", async () => {
    const save = vi.fn();
    render(<Fixture save={save} />);
    expect(screen.queryByRole("region", { name: "Revisa los campos marcados" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const summary = await screen.findByRole("region", { name: "Revisa los campos marcados" });
    await waitFor(() => expect(summary).toHaveFocus());
    expect(save).not.toHaveBeenCalled();
    const links = within(summary).getAllByRole("link");
    for (const link of links) expect(document.getElementById(decodeURIComponent(link.getAttribute("href")!.slice(1)))).toBeTruthy();
    fireEvent.click(within(summary).getByRole("link", { name: "Partida 1: Descripción requerida" }));
    const description = screen.getByRole("textbox", { name: "Descripción" });
    expect(description).toHaveFocus();
    fireEvent.change(description, { target: { value: "Servicio" } });
    await waitFor(() => expect(within(summary).queryByRole("link", { name: /Descripción requerida/ })).not.toBeInTheDocument());
    expect(description).toHaveFocus();
    fireEvent.click(within(summary).getByRole("link", { name: "Cliente: Selecciona un cliente" }));
    const customer = screen.getByRole("textbox", { name: "Cliente" });
    expect(customer).toHaveFocus();
    fireEvent.change(customer, { target: { value: "Cliente demo" } });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Revisa los campos marcados" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it("vuelve al resumen en cada envío inválido", async () => {
    render(<Fixture save={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const summary = await screen.findByRole("region", { name: "Revisa los campos marcados" });
    fireEvent.click(within(summary).getByRole("link", { name: /Cliente:/ }));
    expect(screen.getByRole("textbox", { name: "Cliente" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(summary).toHaveFocus());
  });
});
