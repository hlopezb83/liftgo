import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierFormDialog } from "../SupplierFormDialog";
import type { Supplier } from "../../../hooks/useSuppliers";
import type { SupplierFormData } from "../../../lib/supplierFormSchema";

const fixture = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), upload: vi.fn(), file: null as File | null }));
vi.mock("../../../hooks/useSuppliers", () => ({
  SUPPLIER_CATEGORIES: { otro: "Otro" },
  useCreateSupplier: () => ({ mutateAsync: fixture.create, isPending: false }),
  useUpdateSupplier: () => ({ mutateAsync: fixture.update, isPending: false }),
}));
vi.mock("@/hooks/useDocuments", () => ({ useUploadDocument: () => ({ mutateAsync: fixture.upload, isPending: false }) }));
vi.mock("@/hooks/useUnsavedChangesGuard", () => ({ useUnsavedChangesGuard: vi.fn() }));
vi.mock("@/components/forms/CsfDropzone", () => ({
  CsfDropzone: ({ onParsed }: { onParsed: (data: Partial<SupplierFormData>, file: File) => void }) =>
    <button type="button" onClick={() => onParsed({ name: "Proveedor desde CSF" }, fixture.file!)}>Cargar CSF de prueba</button>,
}));

const supplier: Supplier = {
  id: "supplier-existing", name: "Proveedor existente", contact_person: null, email: null, phone: null,
  website: null, address: null, rfc: null, regimen_fiscal: null, category: null, notes: null,
  default_payment_terms_days: null, created_at: "2026-11-12", updated_at: "2026-11-12",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function attachCsf() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Importar desde CSF" }), { button: 0, ctrlKey: false });
  fireEvent.click(screen.getByRole("button", { name: "Cargar CSF de prueba" }));
}

function submit(label: string) {
  fireEvent.submit(screen.getByRole("button", { name: label }).closest("form")!);
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.create.mockReset().mockResolvedValue({ id: "supplier-created" });
  fixture.update.mockReset().mockResolvedValue(supplier);
  fixture.upload.mockReset().mockResolvedValue({ id: "document-created" });
  fixture.file = new File(["offline CSF fixture"], "constancia fiscal.pdf", { type: "application/pdf" });
});
afterEach(cleanup);

describe("Supplier CSF partial success recovery", () => {
  it("retains the new supplier and file across upload failures, retrying only the attachment", async () => {
    fixture.upload.mockRejectedValueOnce(new Error("offline upload failure"))
      .mockRejectedValueOnce(new Error("still offline"));
    const onOpenChange = vi.fn();
    render(<SupplierFormDialog open supplier={null} onOpenChange={onOpenChange} />);
    attachCsf();
    submit("Agregar proveedor");
    expect(await screen.findByRole("alert")).toHaveTextContent("El proveedor ya está guardado");
    expect(screen.getByText("constancia fiscal.pdf")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(fixture.create).toHaveBeenCalledOnce();
    expect(fixture.upload).toHaveBeenLastCalledWith({ file: fixture.file, entityType: "supplier", entityId: "supplier-created" });

    submit("Reintentar subida de CSF");
    await waitFor(() => expect(fixture.upload).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo adjuntar la CSF");
    submit("Reintentar subida de CSF");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(fixture.upload).toHaveBeenCalledTimes(3);
    expect(fixture.create).toHaveBeenCalledOnce();
    expect(fixture.update).not.toHaveBeenCalled();
    for (const [args] of fixture.upload.mock.calls) expect(args.file).toBe(fixture.file);
  });

  it("does not repeat an update or lose its pending attachment when the same supplier refetches", async () => {
    fixture.upload.mockRejectedValueOnce(new Error("offline upload failure"));
    const onOpenChange = vi.fn();
    const view = render(<SupplierFormDialog open supplier={supplier} onOpenChange={onOpenChange} />);
    attachCsf();
    submit("Guardar cambios");
    await screen.findByRole("alert");
    view.rerender(<SupplierFormDialog open supplier={{ ...supplier, name: "Proveedor desde CSF", updated_at: "2026-11-13" }} onOpenChange={onOpenChange} />);
    expect(screen.getByText("constancia fiscal.pdf")).toBeInTheDocument();
    submit("Reintentar subida de CSF");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(fixture.update).toHaveBeenCalledOnce();
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.upload).toHaveBeenLastCalledWith({ file: fixture.file, entityType: "supplier", entityId: supplier.id });
  });

  it("blocks duplicate saves and closing through the upload, and ignores completion after a different opening", async () => {
    const save = deferred<{ id: string }>();
    const upload = deferred<{ id: string }>();
    fixture.create.mockReturnValueOnce(save.promise);
    fixture.upload.mockReturnValueOnce(upload.promise);
    const onOpenChange = vi.fn();
    const view = render(<SupplierFormDialog open supplier={null} onOpenChange={onOpenChange} />);
    attachCsf();
    const form = screen.getByRole("button", { name: "Agregar proveedor" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(fixture.create).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => { save.resolve({ id: "supplier-created" }); });
    await screen.findByText("Subiendo la CSF…");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();

    view.rerender(<SupplierFormDialog open={false} supplier={null} onOpenChange={onOpenChange} />);
    view.rerender(<SupplierFormDialog open supplier={supplier} onOpenChange={onOpenChange} />);
    await act(async () => { upload.resolve({ id: "document-created" }); });
    expect(screen.getByLabelText(/Nombre \/ Razón Social/)).toHaveValue("Proveedor existente");
    expect(screen.queryByText("constancia fiscal.pdf")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(fixture.upload).toHaveBeenCalledOnce();
  });

  it("confirms discarding the pending file and starts a clean create session on reopening", async () => {
    fixture.upload.mockRejectedValueOnce(new Error("offline upload failure"));
    const onOpenChange = vi.fn();
    const view = render(<SupplierFormDialog open supplier={null} onOpenChange={onOpenChange} />);
    attachCsf();
    submit("Agregar proveedor");
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("¿Descartar cambios?");
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    view.rerender(<SupplierFormDialog open={false} supplier={null} onOpenChange={onOpenChange} />);
    view.rerender(<SupplierFormDialog open supplier={null} onOpenChange={onOpenChange} />);
    expect(screen.getByLabelText(/Nombre \/ Razón Social/)).toHaveValue("");
    expect(screen.queryByText("constancia fiscal.pdf")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Nombre \/ Razón Social/), { target: { value: "Otro proveedor" } });
    submit("Agregar proveedor");
    await waitFor(() => expect(fixture.create).toHaveBeenCalledTimes(2));
    expect(fixture.upload).toHaveBeenCalledOnce();
  });

  it("does not enter attachment-only recovery until saving the supplier succeeds", async () => {
    fixture.create.mockRejectedValueOnce(new Error("offline save failure"));
    render(<SupplierFormDialog open supplier={null} onOpenChange={vi.fn()} />);
    attachCsf();
    submit("Agregar proveedor");
    await waitFor(() => expect(fixture.create).toHaveBeenCalledOnce());
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Agregar proveedor" })).toBeEnabled());
    submit("Agregar proveedor");
    await waitFor(() => expect(fixture.upload).toHaveBeenCalledOnce());
    expect(fixture.create).toHaveBeenCalledTimes(2);
  });
});
