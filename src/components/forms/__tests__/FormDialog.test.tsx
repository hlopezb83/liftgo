import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FormDialog } from "../FormDialog";

function renderDialog(props: Partial<React.ComponentProps<typeof FormDialog>> = {}) {
  const onOpenChange = vi.fn();
  render(
    <FormDialog open onOpenChange={onOpenChange} title="Nuevo cliente" {...props}>
      <input aria-label="Nombre" defaultValue="Acme" />
    </FormDialog>,
  );
  return { onOpenChange };
}

function pressEscape() {
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: "Escape",
    code: "Escape",
  });
}

describe("FormDialog", () => {
  it("cierra directo con Esc cuando no hay cambios", () => {
    const { onOpenChange } = renderDialog();
    pressEscape();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument();
  });

  it("pide confirmación con Esc cuando hay cambios sin guardar", () => {
    const { onOpenChange } = renderDialog({ isDirty: true });
    pressEscape();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("¿Descartar cambios?")).toBeInTheDocument();
  });

  it("'Seguir editando' mantiene el diálogo abierto", () => {
    const { onOpenChange } = renderDialog({ isDirty: true });
    pressEscape();
    fireEvent.click(screen.getByRole("button", { name: /seguir editando/i }));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
  });

  it("'Descartar' cierra el diálogo", () => {
    const { onOpenChange } = renderDialog({ isDirty: true });
    pressEscape();
    fireEvent.click(screen.getByRole("button", { name: /^descartar$/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ignora Esc mientras el submit está en curso", () => {
    const { onOpenChange } = renderDialog({ isDirty: true, isPending: true });
    pressEscape();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument();
  });

  it("muestra título y descripción", () => {
    renderDialog({ description: "Captura los datos fiscales" });
    expect(screen.getByText("Nuevo cliente")).toBeInTheDocument();
    expect(screen.getByText("Captura los datos fiscales")).toBeInTheDocument();
  });
});
