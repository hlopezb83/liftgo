import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupplierContact } from "../../../hooks/useSupplierContacts";
import { SupplierContactFormDialog } from "../SupplierContactFormDialog";

const mutations = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("../../../hooks/useSupplierContacts", () => ({
  SUPPLIER_CONTACT_ROLES: ["Principal", "Otro"],
  useCreateSupplierContact: () => ({ mutate: mutations.create, isPending: false }),
  useUpdateSupplierContact: () => ({ mutate: mutations.update, isPending: false }),
}));
vi.mock("@/components/forms/FormDialog", () => ({
  FormDialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
  FormDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
beforeEach(() => vi.clearAllMocks());
const props = { open: true, onOpenChange: vi.fn(), supplierId: "supplier-qa", contact: null };

describe("SupplierContactFormDialog typed resolver", () => {
  it("submits trimmed name, concrete defaults and null optional fields", async () => {
    render(<SupplierContactFormDialog {...props} />);
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "  Contacto QA  " } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar contacto" }));
    await waitFor(() => expect(mutations.create).toHaveBeenCalledOnce());
    expect(mutations.create.mock.calls[0][0]).toEqual({
      supplier_id: "supplier-qa", name: "Contacto QA", role: "Principal", email: null,
      phone: null, notes: null, is_primary: false,
    });
    expect(mutations.update).not.toHaveBeenCalled();
  });

  it("rejects blank names without mutating", async () => {
    render(<SupplierContactFormDialog {...props} />);
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar contacto" }));
    expect(await screen.findByText("El nombre es requerido")).toBeInTheDocument();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it("resets edit values to create defaults when the dialog is reopened", async () => {
    const contact = {
      id: "contact-qa", supplier_id: "supplier-qa", organization_id: "org-qa",
      name: "Existing QA", role: "Otro", email: "qa@example.test", phone: "123",
      notes: "Old notes", is_primary: true, created_at: "2026-01-01", updated_at: "2026-01-01",
    } satisfies SupplierContact;
    const view = render(<SupplierContactFormDialog {...props} contact={contact} />);
    expect(screen.getByLabelText(/Nombre/)).toHaveValue("Existing QA");
    expect(screen.getByRole("switch")).toBeChecked();
    view.rerender(<SupplierContactFormDialog {...props} contact={contact} open={false} />);
    view.rerender(<SupplierContactFormDialog {...props} />);
    expect(screen.getByLabelText(/Nombre/)).toHaveValue("");
    expect(screen.getByLabelText("Correo")).toHaveValue("");
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.getByRole("combobox")).toHaveTextContent("Principal");
  });
});
