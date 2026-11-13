import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentAttachments } from "../DocumentAttachments";

const state = vi.hoisted(() => ({
  upload: vi.fn(), success: vi.fn(), validation: vi.fn(), canManage: true,
  identity: "user:org:internal" as string | null,
}));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => state.canManage }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => state.identity }));
vi.mock("@/hooks/useDocuments", () => ({
  useDocuments: () => ({ data: [], isLoading: false, isError: false }),
  // The last individual mutation may be idle while a sibling upload is pending.
  useUploadDocument: () => ({ mutateAsync: state.upload, isPending: false }),
  useDeleteDocument: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/components/feedback/useConfirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: state.success, notifyValidation: state.validation }));

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const pdf = (name: string) => new File(["fixture"], name, { type: "application/pdf" });
const panel = (id = "f-1") => <DocumentAttachments entityType="forklift" entityId={id} accessModule="Flota" />;
function selectFiles(container: HTMLElement, files: File[]) {
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files } });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.upload.mockReset();
  state.canManage = true;
  state.identity = "user:org:internal";
});
afterEach(cleanup);

describe("lote de adjuntos", () => {
  it("espera todos los archivos y reintenta sólo el fallido, sin duplicar con doble clic", async () => {
    const failed = deferred(), slow = deferred(), retry = deferred();
    state.upload.mockReturnValueOnce(failed.promise).mockReturnValueOnce(slow.promise).mockReturnValueOnce(retry.promise);
    const files = [pdf("fallido.pdf"), pdf("correcto.pdf")];
    const { container } = render(panel());
    selectFiles(container, files);
    selectFiles(container, files);
    expect(state.upload).toHaveBeenCalledTimes(2);
    await act(async () => failed.reject(new Error("Storage no disponible")));
    expect(screen.getByRole("button", { name: "Subiendo…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Reintentar fallidos/ })).not.toBeInTheDocument();
    expect(state.success).not.toHaveBeenCalled();
    await act(async () => slow.resolve({ id: "success-1" }));
    expect(await screen.findByText("fallido.pdf: Storage no disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir" })).toBeDisabled();
    expect(state.success).toHaveBeenCalledWith("1 archivo(s) subido(s)");
    const retryButton = screen.getByRole("button", { name: "Reintentar fallidos (1)" });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);
    expect(state.upload).toHaveBeenCalledTimes(3);
    expect(state.upload.mock.calls.map(([input]) => input.file.name)).toEqual(["fallido.pdf", "correcto.pdf", "fallido.pdf"]);
    await act(async () => retry.resolve({ id: "retry-1" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Subir" })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("conserva la validación de archivos y permite descartar fallidos sin subirlos otra vez", async () => {
    state.upload.mockRejectedValue(new Error("Permiso denegado"));
    const { container } = render(panel());
    selectFiles(container, [pdf("permitido.pdf"), new File(["x"], "rechazado.exe", { type: "application/octet-stream" })]);
    expect(await screen.findByText("permitido.pdf: Permiso denegado")).toBeInTheDocument();
    expect(state.validation).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("rechazado.exe") }));
    expect(state.upload).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Descartar fallidos" }));
    expect(screen.getByRole("button", { name: "Subir" })).toBeEnabled();
    expect(state.upload).toHaveBeenCalledTimes(1);
  });

  it("una respuesta tardía no revive el lote al cambiar de equipo y volver", async () => {
    const old = deferred();
    state.upload.mockReturnValue(old.promise);
    const { container, rerender } = render(panel());
    selectFiles(container, [pdf("anterior.pdf")]);
    const oldScope = state.upload.mock.calls[0][0].shouldContinue;
    rerender(panel("f-2"));
    rerender(panel());
    expect(oldScope()).toBe(false);
    await act(async () => old.reject(new Error("Respuesta anterior")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir" })).toBeEnabled();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("descarta la cola al cambiar de identidad y desactiva trabajos al desmontar", async () => {
    state.upload.mockRejectedValueOnce(new Error("Reintentar"));
    const { container, rerender, unmount } = render(panel());
    selectFiles(container, [pdf("cuenta-anterior.pdf")]);
    expect(await screen.findByRole("button", { name: "Reintentar fallidos (1)" })).toBeInTheDocument();
    state.identity = "otro-user:otra-org:internal";
    rerender(panel());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const pending = deferred();
    state.upload.mockReturnValueOnce(pending.promise);
    selectFiles(container, [pdf("nuevo.pdf")]);
    const scope = state.upload.mock.calls[1][0].shouldContinue;
    unmount();
    expect(scope()).toBe(false);
    await act(async () => pending.resolve({ id: "late-success" }));
    expect(state.success).not.toHaveBeenCalled();
  });

  it.each(["readonly", "unverified"])("no ofrece cargas en contexto %s", kind => {
    state.canManage = kind !== "readonly";
    state.identity = kind === "unverified" ? null : state.identity;
    const { container } = render(panel());
    expect(screen.queryByRole("button", { name: "Subir" })).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
});
