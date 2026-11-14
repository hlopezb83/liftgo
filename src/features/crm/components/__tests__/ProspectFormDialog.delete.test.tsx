import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { CRMPageDialogs } from "../CRMPageDialogs";
import { useCRMPageDialogs } from "../../hooks/useCRMPageDialogs";
import type { Prospect } from "../../hooks/useProspects";

vi.mock("@/features/quotes", () => ({
  useCrmQuoteOptions: () => ({ data: { pages: [] }, isError: false, isPending: false }),
  useCrmQuote: () => ({ data: null, isError: false, isPending: false }),
}));
vi.mock("../ProspectDetailSheet", () => ({ ProspectDetailSheet: () => null }));
vi.mock("../prospect-form/ProspectQuoteSelector", () => ({ ProspectQuoteSelector: () => null }));
vi.mock("../prospect-form/ProspectCloseDealActions", () => ({ ProspectCloseDealActions: () => null }));
const remove = vi.fn<(id: string) => Promise<void>>();
const prospect = { id: "prospect-a", companyName: "Empresa QA", contactPerson: "Contacto", stage: "nuevo_prospecto", dealValue: 0, notes: "Nota inicial" } as Prospect;

function Harness() {
  const dialogs = useCRMPageDialogs();
  const [started, setStarted] = useState(false);
  if (!started) {
    setStarted(true);
    dialogs.setEditingProspect(prospect);
    dialogs.setDialogOpen(true);
  }
  return <CRMPageDialogs dialogs={dialogs} quoteMap={new Map()} canCloseDeal assertCanClose={() => true}
    openEdit={vi.fn()} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={remove} />;
}

beforeEach(() => { remove.mockReset(); });

async function confirmDeletion() {
  fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
  const confirmation = await screen.findByRole("alertdialog");
  expect(confirmation).toHaveTextContent("Empresa QA");
  await act(async () => { fireEvent.click(within(confirmation).getByRole("button", { name: "Eliminar" })); });
}

it("requires named confirmation, cancels without mutation and retains the draft on failed deletion", async () => {
  remove.mockRejectedValue(new Error("Synthetic failure"));
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Persona de contacto"), { target: { value: "Captura local" } });
  fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
  expect(remove).not.toHaveBeenCalled();
  await confirmDeletion();
  await waitFor(() => expect(remove).toHaveBeenCalledWith("prospect-a"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Eliminar" })).toBeEnabled());
  expect(screen.getByLabelText("Persona de contacto")).toHaveValue("Captura local");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("awaits the delete promise, blocks closing and repeated actions, and closes only after success", async () => {
  let resolve!: () => void;
  remove.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
  render(<Harness />);
  await confirmDeletion();
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  const original = screen.getByRole("dialog");
  fireEvent.keyDown(original, { key: "Escape" });
  fireEvent.click(within(original).getByRole("button", { name: "Cerrar" }));
  expect(original).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Eliminar" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(screen.getByLabelText("Persona de contacto")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
  expect(remove).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
