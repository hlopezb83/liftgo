import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerFormData } from "../../../lib/customerFormSchema";
import { CustomerFormDialog } from "../CustomerFormDialog";

vi.mock("@/hooks/useUnsavedChangesGuard", () => ({ useUnsavedChangesGuard: vi.fn() }));
vi.mock("@/components/forms/CsfDropzone", () => ({
  CsfDropzone: ({ onParsed }: { onParsed: (patch: Partial<CustomerFormData>) => void }) => (
    <button type="button" onClick={() => onParsed({ name: "HYVA DE MEXICO", rfc: "HME080121I64" })}>
      Simular lectura de CSF
    </button>
  ),
}));

afterEach(cleanup);

function openCsf() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: /CSF/ }), { button: 0, ctrlKey: false });
}

async function importCsf() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Simular lectura de CSF" })); });
}

describe("CustomerFormDialog", () => {
  it("pide confirmar antes de descartar datos importados desde una CSF", async () => {
    const onOpenChange = vi.fn();
    render(<CustomerFormDialog open onOpenChange={onOpenChange} onSubmit={vi.fn()} />);
    openCsf();
    await importCsf();
    expect(screen.getByRole("textbox", { name: /Nombre/ })).toHaveValue("HYVA DE MEXICO");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("¿Descartar cambios?")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("conserva el borrador y los valores originales ante un refetch mientras se edita", () => {
    const props = { open: true, isEdit: true, onOpenChange: vi.fn(), onSubmit: vi.fn() };
    const { rerender } = render(<CustomerFormDialog {...props} initialData={{ name: "Cliente original", email: "original@example.com" }} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Nombre/ }), { target: { value: "Mi cambio local" } });
    rerender(<CustomerFormDialog {...props} initialData={{ name: "Cambio de otra sesión", email: "externo@example.com" }} />);
    expect(screen.getByRole("textbox", { name: /Nombre/ })).toHaveValue("Mi cambio local");
    expect(screen.getByRole("textbox", { name: "Correo" })).toHaveValue("original@example.com");
  });

  it("renueva valores y pestaña al volver a abrir", async () => {
    const props = { open: true, isEdit: true, onOpenChange: vi.fn(), onSubmit: vi.fn(), initialData: { name: "Cliente" } };
    const { rerender } = render(<CustomerFormDialog {...props} />);
    openCsf();
    await importCsf();
    rerender(<CustomerFormDialog {...props} open={false} />);
    rerender(<CustomerFormDialog {...props} initialData={{ name: "Cliente actualizado" }} />);
    expect(screen.getByRole("tab", { name: /manual/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: /Nombre/ })).toHaveValue("Cliente actualizado");
  });

  it("conserva un borrado manual de correo después de importar la CSF", async () => {
    const onSubmit = vi.fn();
    render(<CustomerFormDialog open isEdit onOpenChange={vi.fn()} onSubmit={onSubmit} initialData={{ name: "Cliente", email: "anterior@example.com" }} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Correo" }), { target: { value: "" } });
    openCsf();
    await importCsf();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" })); });
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ email: "", name: "HYVA DE MEXICO" }));
  });

  it("no cierra ni vuelve a enviar el formulario durante una mutación pendiente", async () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    render(<CustomerFormDialog open isEdit isPending onOpenChange={onOpenChange} onSubmit={onSubmit} initialData={{ name: "Cliente" }} />);
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    const form = screen.getByRole("textbox", { name: /Nombre/ }).closest("form");
    if (!form) throw new Error("Formulario ausente");
    await act(async () => { fireEvent.submit(form); });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
