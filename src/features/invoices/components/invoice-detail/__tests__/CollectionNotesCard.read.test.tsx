import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CollectionNotesCard } from "../CollectionNotesCard";

const query = vi.hoisted(() => ({ data: undefined as { id: string; note: string; created_at: string; next_followup_date: string | null }[] | undefined,
  isLoading: false, isError: true, isSuccess: false, isFetching: false, refetch: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => true }));
vi.mock("../../../hooks/invoices/collections/useCollectionNotes", () => ({
  useCollectionNotes: () => query, useCreateCollectionNote: () => ({ mutate: vi.fn(), isPending: false }),
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
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.getByText("Sin gestiones registradas")).toBeInTheDocument();
});
