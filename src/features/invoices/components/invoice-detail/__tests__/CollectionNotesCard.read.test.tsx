import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CollectionNotesCard } from "../CollectionNotesCard";

const query = vi.hoisted(() => ({ data: undefined as { id: string; note: string; created_at: string; next_followup_date: string | null }[] | undefined,
  isLoading: false, isError: true, isSuccess: false, isFetching: false, refetch: vi.fn() }));
const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => true }));
vi.mock("../../../hooks/collections/useCollectionNotes", () => ({
  useCollectionNotes: () => query, useCreateCollectionNote: () => ({ mutate, isPending: false }),
}));

it("retries locally without dropping a collection draft or cached notes and reserves empty for success", () => {
  const view = render(<CollectionNotesCard invoiceId="invoice-a" />);
  expect(screen.queryByText("Sin gestiones registradas")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Nueva Gestión" }));
  fireEvent.change(screen.getByLabelText("Nota de seguimiento"), { target: { value: "Promesa local de pago" } });
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(query.refetch).toHaveBeenCalledOnce();
  query.isFetching = true;
  query.data = [{ id: "note-a", note: "Gestión guardada", created_at: "2026-11-14T12:00:00Z", next_followup_date: null }];
  view.rerender(<CollectionNotesCard invoiceId="invoice-a" />);
  expect(screen.getByText("Gestión guardada")).toBeInTheDocument();
  expect(screen.getByLabelText("Nota de seguimiento")).toHaveValue("Promesa local de pago");
  expect(screen.getByRole("button", { name: "Reintentar" })).toBeDisabled();
  query.data = []; query.isError = false; query.isFetching = false; query.isSuccess = true;
  view.rerender(<CollectionNotesCard invoiceId="invoice-a" />);
  expect(screen.getByLabelText("Nota de seguimiento")).toHaveValue("Promesa local de pago");
  fireEvent.click(screen.getByRole("button", { name: "Cerrar borrador" }));
  expect(screen.getByText("Sin gestiones registradas")).toBeInTheDocument();
});

it("enfoca la nota al abrir y vuelve al activador al cerrar", () => {
  render(<CollectionNotesCard invoiceId="invoice-a" />);
  fireEvent.click(screen.getByRole("button", { name: "Nueva Gestión" }));
  const note = screen.getByRole("textbox", { name: "Nota de seguimiento" });
  expect(note).toHaveFocus();
  fireEvent.change(note, { target: { value: "Borrador A" } });
  fireEvent.click(screen.getByRole("button", { name: "Cerrar borrador" }));
  const resume = screen.getByRole("button", { name: "Continuar borrador" });
  expect(resume).toHaveFocus();
  fireEvent.click(resume);
  expect(screen.getByRole("textbox", { name: "Nota de seguimiento" })).toHaveFocus();
  expect(screen.getByRole("textbox", { name: "Nota de seguimiento" })).toHaveValue("Borrador A");
});

it("descarta el borrador local al cambiar de factura y guarda sólo la nueva nota", () => {
  const view = render(<CollectionNotesCard invoiceId="invoice-a" />);
  fireEvent.click(screen.getByRole("button", { name: "Nueva Gestión" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nota de seguimiento" }), { target: { value: "Borrador A" } });
  view.rerender(<CollectionNotesCard invoiceId="invoice-b" />);
  expect(screen.queryByRole("textbox", { name: "Nota de seguimiento" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Nueva Gestión" }));
  const note = screen.getByRole("textbox", { name: "Nota de seguimiento" });
  expect(note).toHaveValue("");
  expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  fireEvent.change(note, { target: { value: " Borrador B " } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(mutate).toHaveBeenCalledExactlyOnceWith({
    invoice_id: "invoice-b", note: "Borrador B", next_followup_date: null,
  }, expect.objectContaining({ onSuccess: expect.any(Function) }));
});
