// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StampErrorDialog } from "../StampErrorDialog";

vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: vi.fn(),
}));

function renderDialog(props: Partial<React.ComponentProps<typeof StampErrorDialog>> = {}) {
  return render(
    <MemoryRouter>
      <StampErrorDialog
        open
        onOpenChange={() => {}}
        message="Error de prueba"
        kind="receptor_data"
        customerId="cust-1"
        receptor={{
          rfc: "AAA010101AAA",
          razonSocial: "EMPRESA DE PRUEBA",
          cp: "64000",
          regimenFiscal: "601",
        }}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("StampErrorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("muestra los 4 campos del receptor con kind receptor_data", () => {
    renderDialog();
    expect(screen.getByText("Datos enviados al SAT")).toBeInTheDocument();
    expect(screen.getByText("AAA010101AAA")).toBeInTheDocument();
    expect(screen.getByText("EMPRESA DE PRUEBA")).toBeInTheDocument();
    expect(screen.getByText("601")).toBeInTheDocument();
    expect(screen.getByText("64000")).toBeInTheDocument();
  });

  it("oculta el bloque cuando kind no es receptor_data", () => {
    renderDialog({ kind: "csd" });
    expect(screen.queryByText("Datos enviados al SAT")).not.toBeInTheDocument();
  });

  it("oculta el bloque cuando no hay receptor aunque el kind sea receptor_data", () => {
    renderDialog({ receptor: undefined });
    expect(screen.queryByText("Datos enviados al SAT")).not.toBeInTheDocument();
  });

  it("copia el valor al portapapeles al pulsar el botón copiar", () => {
    renderDialog();
    fireEvent.click(screen.getByLabelText("Copiar RFC"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("AAA010101AAA");
  });
});
