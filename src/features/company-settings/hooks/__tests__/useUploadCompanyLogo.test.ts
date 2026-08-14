import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fix 9.2 (Sprint 9): el logo solo acepta PNG/JPG/WebP y máximo 2 MB.
 * Sin esto se podía subir un SVG (vector con scripts) al bucket público.
 */
const notifyValidationMock = vi.fn();
const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn(() => ({ data: { publicUrl: "https://cdn/logo.png" } }));

vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
  notifyInfo: vi.fn(),
  notifyValidation: (...args: unknown[]) => notifyValidationMock(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => uploadMock(...args),
        getPublicUrl: () => getPublicUrlMock(),
      }),
    },
  },
}));

import { useUploadCompanyLogo } from "../useUploadCompanyLogo";

function fakeFile(type: string, size: number, name = "logo") {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("useUploadCompanyLogo · Fix 9.2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadMock.mockResolvedValue({ error: null });
  });

  it("rechaza archivos mayores a 2 MB sin llamar al almacenamiento", async () => {
    const { result } = renderHook(() => useUploadCompanyLogo());
    const url = await result.current.upload(fakeFile("image/png", 3 * 1024 * 1024));
    expect(url).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(notifyValidationMock).toHaveBeenCalledWith({ message: "El archivo no debe superar 2MB" });
  });

  it("rechaza SVG y otros tipos no permitidos", async () => {
    const { result } = renderHook(() => useUploadCompanyLogo());
    const url = await result.current.upload(fakeFile("image/svg+xml", 1000, "logo.svg"));
    expect(url).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(notifyValidationMock).toHaveBeenCalledWith({
      message: "Solo se permiten imágenes PNG, JPG o WebP",
    });
  });

  it("acepta PNG dentro del límite y devuelve la URL pública", async () => {
    const { result } = renderHook(() => useUploadCompanyLogo());
    const url = await result.current.upload(fakeFile("image/png", 500 * 1024, "logo.png"));
    expect(url).toBe("https://cdn/logo.png");
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const path = uploadMock.mock.calls[0][0] as string;
    expect(path.endsWith(".png")).toBe(true);
  });
});
