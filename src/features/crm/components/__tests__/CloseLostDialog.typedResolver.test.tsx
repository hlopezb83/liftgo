import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Prospect } from "../../lib/prospectTypes";
import { CloseLostDialog } from "../CloseLostDialog";

vi.mock("@/components/forms/FormDialog", () => ({
  FormDialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
  FormDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const prospect: Prospect = {
  id: "prospect-qa", companyName: "Cliente QA", contactPerson: null, email: null,
  phone: null, dealValue: 100, dealValueLabel: "$100", stage: "contactado", stageOrder: 1,
  notes: null, quoteId: null, customerId: null, createdBy: null, createdByName: null,
  createdAt: "2026-01-01", createdAtLabel: "01/01/2026", updatedAt: "2026-01-01",
  staleDays: 0, isStale: false, isClosed: false, closedAt: null, closedAtLabel: null,
  lostReason: null, finalAmount: null,
};
async function chooseReason(label: string) {
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: label }));
}

describe("CloseLostDialog typed resolver", () => {
  it("submits the default empty note without losing the output type/default", async () => {
    const onConfirm = vi.fn();
    render(<CloseLostDialog open prospect={prospect} onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    await chooseReason("Precio");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar perdido" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ lost_reason: "precio" });
    expect(onConfirm.mock.calls[0][0].notes).toMatch(/Razón: Precio$/);
    expect(screen.getByLabelText("Nota")).toHaveValue("");
  });

  it("preserves cross-field validation and trims the submitted extra note", async () => {
    const onConfirm = vi.fn();
    render(<CloseLostDialog open prospect={prospect} onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    await chooseReason("Otro");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar perdido" }));
    expect(await screen.findByText("Describe la razón cuando eliges 'Otro'")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Nota/), { target: { value: "  Motivo QA  " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar perdido" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onConfirm.mock.calls[0][0].notes).toMatch(/Razón: Otro — Motivo QA$/);
  });

  it("resets prior input on reopening and preserves pending disable", async () => {
    const props = { prospect, onOpenChange: vi.fn(), onConfirm: vi.fn() };
    const view = render(<CloseLostDialog {...props} open />);
    await chooseReason("Precio");
    fireEvent.change(screen.getByLabelText("Nota"), { target: { value: "old note" } });
    view.rerender(<CloseLostDialog {...props} open={false} />);
    view.rerender(<CloseLostDialog {...props} open isPending />);
    expect(screen.getByLabelText("Nota")).toHaveValue("");
    expect(screen.getByRole("combobox")).not.toHaveTextContent("Precio");
    expect(screen.getByRole("button", { name: "Confirmar perdido" })).toBeDisabled();
  });
});
