import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedCsfData } from "@/lib/fiscal/useParseCsf";
import { CsfDropzone } from "../CsfDropzone";

const state = vi.hoisted(() => ({ pending: false, mutate: vi.fn(), success: vi.fn(), error: vi.fn(), validation: vi.fn() }));
vi.mock("@/lib/fiscal/useParseCsf", () => ({ useParseCsf: () => ({ isPending: state.pending, mutate: state.mutate }) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: state.success, notifyError: state.error, notifyValidation: state.validation }));
const parsed: ParsedCsfData = { rfc: "XAXX010101000", razon_social: "EMPRESA QA", domicilio_fiscal_cp: "64000" };
const file = () => new File(["%PDF"], "csf.pdf", { type: "application/pdf" });
function upload(container: HTMLElement, value: File) {
  const input = container.querySelector('input[type="file"]');
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { files: [value] } });
}
beforeEach(() => { vi.clearAllMocks(); state.pending = false; });
describe("CSF shared dropzone", () => {
  it("passes parsed data through the caller's mapper and retains the original file", async () => {
    state.mutate.mockImplementation((_file: File, callbacks: { onSuccess: (data: ParsedCsfData) => void }) => callbacks.onSuccess(parsed));
    const patch = { fiscalName: "mapped by the owning feature" };
    const mapper = vi.fn(() => patch);
    const onParsed = vi.fn();
    const view = render(<CsfDropzone mapData={mapper} onParsed={onParsed} />);
    const pdf = file();
    upload(view.container, pdf);
    await waitFor(() => expect(onParsed).toHaveBeenCalledWith(patch, pdf));
    expect(mapper).toHaveBeenCalledExactlyOnceWith(parsed);
    expect(screen.getByText("Datos extraídos")).toBeInTheDocument();
    expect(state.success).toHaveBeenCalledWith("Datos fiscales extraídos. Revisa y completa la información.");
  });
  it("preserves the parse error message without applying a patch", async () => {
    const error = new Error("PDF ilegible");
    state.mutate.mockImplementation((_file: File, callbacks: { onError: (error: unknown) => void }) => callbacks.onError(error));
    const onParsed = vi.fn();
    const view = render(<CsfDropzone mapData={data => data} onParsed={onParsed} />);
    upload(view.container, file());
    await waitFor(() => expect(state.error).toHaveBeenCalledWith({ error, message: "Error al procesar la constancia" }));
    expect(onParsed).not.toHaveBeenCalled();
  });
  it("rejects non-PDF files before calling the shared parser", async () => {
    const view = render(<CsfDropzone mapData={data => data} onParsed={vi.fn()} />);
    upload(view.container, new File(["text"], "not-pdf.txt", { type: "text/plain" }));
    await waitFor(() => expect(state.validation).toHaveBeenCalledWith({ message: "Solo se aceptan archivos PDF" }));
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("disables uploads while parsing", async () => {
    state.pending = true;
    const view = render(<CsfDropzone mapData={data => data} onParsed={vi.fn()} />);
    await act(async () => { upload(view.container, file()); });
    expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Extrayendo datos fiscales…")).toBeInTheDocument();
  });
});
