import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode, Ref } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractDetailActions } from "../ContractDetailActions";
import type { ContractData } from "../ContractPDFButton";

const roleAccess = vi.hoisted(() => ({ canWrite: true }));

vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/layouts/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: ReactNode }) => roleAccess.canWrite ? <>{children}</> : null,
}));
vi.mock("../ContractPDFButton", () => ({
  ContractPDFButton: ({ triggerRef }: { triggerRef?: Ref<HTMLButtonElement> }) => <button type="button" ref={triggerRef}>PDF</button>,
}));

function contract(signedBy: string | null): ContractData {
  return {
    contract_number: "CT-0001",
    status: "sent",
    signed_by: signedBy,
    signed_at: null,
  } as unknown as ContractData;
}

describe("ContractDetailActions · firma (bloque 2 · C)", () => {
  beforeEach(() => { roleAccess.canWrite = true; });

  it.each(["draft", "sent", "signed"])("oculta acciones de escritura en estado %s para solo lectura", (status) => {
    roleAccess.canWrite = false;
    render(<ContractDetailActions id="ct-1" status={status} contract={contract("Juan Pérez")}
      onSetStatus={vi.fn()} onSetSigner={vi.fn()} signerPending={false} statusPending={false} />);
    expect(screen.queryByRole("button", { name: /Editar|Marcar|Cancelar/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF" })).toBeInTheDocument();
  });

  it("firma cuando ya hay firmante registrado", async () => {
    const onSetStatus = vi.fn();
    render(<ContractDetailActions id="ct-1" status="sent" contract={contract("Juan Pérez")}
      onSetStatus={onSetStatus} onSetSigner={vi.fn()} signerPending={false} statusPending={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Marcar Firmado/i }));
    expect(onSetStatus).toHaveBeenCalledWith("signed", expect.objectContaining({ signed_at: expect.any(String) }));
  });

  it("no firma sin firmante registrado", async () => {
    const onSetStatus = vi.fn();
    const onSetSigner = vi.fn().mockResolvedValue(undefined);
    render(<ContractDetailActions id="ct-1" status="sent" contract={contract("  ")}
      onSetStatus={onSetStatus} onSetSigner={onSetSigner} signerPending={false} statusPending={false} />);
    expect(screen.queryByRole("button", { name: /Marcar Firmado/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Registrar firmante/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /Firmado por/i }), { target: { value: " María López " } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar firmante/i }));
    expect(await screen.findByRole("button", { name: /Registrar firmante/i })).toBeInTheDocument();
    expect(onSetSigner).toHaveBeenCalledWith("María López");
    expect(onSetStatus).not.toHaveBeenCalled();
  });

  it.each(["draft", "sent"])("confirma una sola cancelación en estado %s e identifica el contrato", async (status) => {
    const onSetStatus = vi.fn();
    render(<ContractDetailActions id="ct-1" status={status} contract={contract(null)}
      onSetStatus={onSetStatus} onSetSigner={vi.fn()} signerPending={false} statusPending={false} />);
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    fireEvent.click(cancel);
    const firstPrompt = within(screen.getByRole("alertdialog", { name: "¿Cancelar el contrato CT-0001?" }));
    expect(onSetStatus).not.toHaveBeenCalled();
    fireEvent.click(firstPrompt.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(onSetStatus).not.toHaveBeenCalled();

    fireEvent.click(cancel);
    const secondPrompt = within(screen.getByRole("alertdialog", { name: "¿Cancelar el contrato CT-0001?" }));
    fireEvent.click(secondPrompt.getByRole("button", { name: "Cancelar contrato" }));
    expect(onSetStatus).toHaveBeenCalledExactlyOnceWith("cancelled");
    await waitFor(() => expect(screen.getByRole("button", { name: "PDF" })).toHaveFocus());
  });
});
