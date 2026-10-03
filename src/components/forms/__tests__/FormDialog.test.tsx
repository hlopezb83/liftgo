import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FormDialog } from "../FormDialog";

function renderDialog(props: Partial<React.ComponentProps<typeof FormDialog>> = {}) {
  const onOpenChange = vi.fn();
  const view = render(
    <FormDialog open onOpenChange={onOpenChange} title="Nuevo cliente" {...props}>
      <input aria-label="Nombre" defaultValue="Acme" />
    </FormDialog>,
  );
  return { onOpenChange, ...view };
}

function pressEscape() {
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: "Escape",
    code: "Escape",
  });
}

describe("FormDialog", () => {
  it("permite copiar un aviso sin cerrar ni pedir descartar el formulario", async () => {
    const copy = vi.fn();
    const onOpenChange = vi.fn();
    render(<>
      <div data-sonner-toaster="" aria-live="polite" style={{ pointerEvents: "auto" }}>
        <button onClick={copy}>Copiar JSON</button>
      </div>
      <FormDialog open isDirty onOpenChange={onOpenChange} title="Nuevo cliente">
        <input aria-label="Nombre" defaultValue="Acme" />
      </FormDialog>
    </>);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const copyButton = screen.getByRole("button", { name: "Copiar JSON" });
    fireEvent.pointerDown(copyButton, { pointerType: "mouse" });
    fireEvent.click(copyButton);
    expect(copy).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Acme");
    pressEscape();
    expect(screen.getByText("¿Descartar cambios?")).toBeInTheDocument();
  });
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

  it("retira la confirmación pendiente al cerrar desde el guardado y no la reabre", () => {
    const { onOpenChange, rerender } = renderDialog({ isDirty: true });
    pressEscape();
    expect(screen.getByText("¿Descartar cambios?")).toBeInTheDocument();

    const savedDialog = (open: boolean) => (
      <FormDialog open={open} isDirty onOpenChange={onOpenChange} title="Nuevo cliente">
        <input aria-label="Nombre" defaultValue="Acme" />
      </FormDialog>
    );
    rerender(savedDialog(false));
    expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    rerender(savedDialog(true));
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument();
  });

  it("muestra título y descripción", () => {
    renderDialog({ description: "Captura los datos fiscales" });
    expect(screen.getByText("Nuevo cliente")).toBeInTheDocument();
    expect(screen.getByText("Captura los datos fiscales")).toBeInTheDocument();
  });
});
