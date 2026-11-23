import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplierBillCfdiDropzone } from "../SupplierBillCfdiDropzone";

function renderDropzone() {
  const onFile = vi.fn();
  const { container } = render(
    <SupplierBillCfdiDropzone busy={false} error={null} result={null} onFile={onFile} onClear={vi.fn()} />,
  );
  return {
    onFile,
    input: container.querySelector('input[type="file"]')!,
    dropzone: screen.getByRole("button", { name: "Zona para importar CFDI XML" }),
  };
}

afterEach(cleanup);

describe("Importación de CFDI de proveedor", () => {
  it("explica el rechazo de un archivo de otro formato hasta elegir un XML", async () => {
    const { input, dropzone, onFile } = renderDropzone();
    const invalid = new File(["texto"], "nota.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [invalid] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("debe estar en formato XML");
    fireEvent.mouseLeave(dropzone);
    expect(dropzone).toHaveAccessibleDescription("El archivo seleccionado debe estar en formato XML.");
    expect(onFile).not.toHaveBeenCalled();

    const xml = new File(["<cfdi />"], "factura.xml", { type: "application/xml" });
    fireEvent.change(input, { target: { files: [xml] } });
    await waitFor(() => expect(onFile).toHaveBeenCalledExactlyOnceWith(xml));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["factura2.xml", "nota.txt"])("rechaza todo el intento al soltar un XML junto con %s", async (name) => {
    const { dropzone, onFile } = renderDropzone();
    const files = [new File(["<cfdi />"], "factura.xml"), new File([""], name)];
    const dataTransfer = new DataTransfer();
    for (const file of files) dataTransfer.items.add(file);
    fireEvent.drop(dropzone, { dataTransfer });
    expect(await screen.findByRole("alert")).toHaveTextContent("Selecciona un solo archivo XML");
    expect(onFile).not.toHaveBeenCalled();
  });
});
