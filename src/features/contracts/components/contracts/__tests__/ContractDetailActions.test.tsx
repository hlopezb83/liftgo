import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractDetailActions } from "../ContractDetailActions";
import type { ContractData } from "../ContractPDFButton";

const roleAccess = vi.hoisted(() => ({ canWrite: true }));

vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/layouts/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: ReactNode }) => roleAccess.canWrite ? <>{children}</> : null,
}));
vi.mock("../ContractPDFButton", () => ({ ContractPDFButton: () => <button type="button">PDF</button> }));

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
    render(<ContractDetailActions id="ct-1" status={status} contract={contract("Juan Pérez")} onSetStatus={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Editar|Marcar|Cancelar/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF" })).toBeInTheDocument();
  });

  it("firma cuando ya hay firmante registrado", async () => {
    const onSetStatus = vi.fn();
    render(<ContractDetailActions id="ct-1" status="sent" contract={contract("Juan Pérez")} onSetStatus={onSetStatus} />);
    fireEvent.click(screen.getByRole("button", { name: /Marcar Firmado/i }));
    expect(onSetStatus).toHaveBeenCalledWith("signed", expect.objectContaining({ signed_at: expect.any(String) }));
  });

  it("no firma sin firmante registrado", async () => {
    const onSetStatus = vi.fn();
    render(<ContractDetailActions id="ct-1" status="sent" contract={contract("  ")} onSetStatus={onSetStatus} />);
    fireEvent.click(screen.getByRole("button", { name: /Marcar Firmado/i }));
    expect(onSetStatus).not.toHaveBeenCalled();
  });
});
