import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContractDetailActions } from "../ContractDetailActions";
import type { ContractData } from "../ContractPDFButton";

vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
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
  it("firma cuando ya hay firmante registrado", async () => {
    const onSetStatus = vi.fn();
    render(<ContractDetailActions id="ct-1" status="sent" contract={contract("Juan Pérez")} onSetStatus={onSetStatus} />);
    fireEvent.click(screen.getByRole("button", { name: /Marcar Firmado/i }));
    expect(onSetStatus).toHaveBeenCalledWith("signed", expect.objectContaining({ signed_at: expect.any(String) }));
  });

  it("no firma sin firmante y explica el motivo", async () => {
    const onSetStatus = vi.fn();
    render(<ContractDetailActions id="ct-1" status="sent" contract={contract("  ")} onSetStatus={onSetStatus} />);
    fireEvent.click(screen.getByRole("button", { name: /Marcar Firmado/i }));
    expect(onSetStatus).not.toHaveBeenCalled();
    expect(await screen.findByText(/Falta registrar quién firmó/i)).toBeInTheDocument();
  });
});
