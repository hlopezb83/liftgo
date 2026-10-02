import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorDiagnostic } from "../ErrorDiagnostic";

describe("copia del diagnóstico", () => {
  const write = vi.fn();
  beforeEach(() => { write.mockReset().mockResolvedValue(undefined); vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: write } }); });
  afterEach(() => vi.unstubAllGlobals());

  it("copia JSON válido, conserva el error y confirma el resultado junto al botón", async () => {
    render(<ErrorDiagnostic title="No se pudo exportar" error={Object.assign(new Error("Sin conexión"), { status: 503 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar JSON" }));
    await screen.findByRole("button", { name: "JSON copiado" });
    const report = JSON.parse(write.mock.calls[0][0]);
    expect(report.errorDetails).toMatchObject({ message: "Sin conexión", status: 503 });
    expect(report.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(report.errorCode).toBe("INTERNAL_ERROR");
  });

  it("si el portapapeles rechaza la copia, abre el JSON seleccionable y no anuncia éxito", async () => {
    write.mockRejectedValue(new Error("Permiso denegado"));
    render(<ErrorDiagnostic title="Fallo de consulta" error={new Error("Datos no disponibles")} />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar JSON" }));
    const text = await screen.findByRole("textbox", { name: "Diagnóstico del error en JSON" });
    expect(JSON.parse((text as HTMLTextAreaElement).value).errorDetails.message).toBe("Datos no disponibles");
    expect(screen.queryByRole("button", { name: "JSON copiado" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar detalles" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("otro error restaura el estado de copia y cambia la instantánea", async () => {
    const view = render(<ErrorDiagnostic title="Primero" error="Primer fallo" />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar JSON" }));
    await screen.findByRole("button", { name: "JSON copiado" });
    view.rerender(<ErrorDiagnostic title="Segundo" error="Segundo fallo" />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar JSON" }));
    await screen.findByRole("button", { name: "JSON copiado" });
    expect(JSON.parse(write.mock.calls[1][0]).errorDetails.message).toBe("Segundo fallo");
  });
});
