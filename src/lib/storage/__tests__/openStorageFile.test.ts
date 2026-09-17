import { beforeEach, describe, expect, it, vi } from "vitest";

const createSignedUrl = vi.fn();
const notifyError = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: (...args: unknown[]) => notifyError(...args),
}));

const SUPABASE_URL = "https://proyecto.supabase.co";

describe("openStoredFile con referencias antiguas", () => {
  beforeEach(() => {
    vi.resetModules();
    createSignedUrl.mockReset();
    notifyError.mockReset();
    vi.stubEnv("VITE_SUPABASE_URL", SUPABASE_URL);
    vi.stubGlobal("window", { open: vi.fn() });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://firmada" }, error: null });
  });

  it("re-firma una URL antigua de Storage en vez de abrirla tal cual", async () => {
    const { openStoredFile } = await import("../openStorageFile");
    const legacy =
      `${SUPABASE_URL}/storage/v1/object/sign/documents/` +
      `0a000000-0000-4000-8000-00000000000a/invoice/fac/archivo%20a.pdf?token=viejo`;

    await openStoredFile("documents", legacy);

    expect(createSignedUrl).toHaveBeenCalledWith(
      "0a000000-0000-4000-8000-00000000000a/invoice/fac/archivo a.pdf",
      60,
    );
    expect(window.open).toHaveBeenCalledWith("https://firmada", "_blank", "noopener");
  });

  it("no abre una URL de otro origen (no se salta la autorización actual)", async () => {
    const { openStoredFile } = await import("../openStorageFile");

    await openStoredFile("documents", "https://atacante.example/storage/v1/object/sign/documents/x.pdf");

    expect(window.open).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalled();
  });

  it("no abre una URL de Storage de otro bucket que el solicitado", async () => {
    const { openStoredFile } = await import("../openStorageFile");

    await openStoredFile(
      "documents",
      `${SUPABASE_URL}/storage/v1/object/sign/cfdi-files/org/secreto.xml?token=viejo`,
    );

    expect(window.open).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalled();
  });

  it("firma normalmente cuando el valor persistido es una ruta", async () => {
    const { openStoredFile } = await import("../openStorageFile");

    await openStoredFile("documents", "org/invoice/fac/archivo.pdf");

    expect(createSignedUrl).toHaveBeenCalledWith("org/invoice/fac/archivo.pdf", 60);
  });
});
