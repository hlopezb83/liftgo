/**
 * BL-35 / BL-36 · useUploadDocument
 *
 *  - BL-35: la fila `documents` debe registrar `uploaded_by` con el user.id
 *           actual para conservar trazabilidad del autor del archivo.
 *  - BL-36: si el INSERT falla después de que el archivo ya subió al bucket,
 *           el objeto debe eliminarse para no dejar archivos huérfanos.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadMock = vi.fn();
const removeMock = vi.fn();
const insertMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => uploadMock(...args),
        remove: (...args: unknown[]) => removeMock(...args),
      }),
    },
    from: () => ({
      insert: (row: unknown) => {
        insertMock(row);
        const results = insertMock.mock.results;
        const last = results[results.length - 1]?.value;
        return {
          select: () => ({ single: () => last }),
        };
      },
    }),

  },
}));

import { useUploadDocument } from "@/hooks/useDocuments";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const USER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  uploadMock.mockReset();
  removeMock.mockReset();
  insertMock.mockReset();
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } });
});

describe("useUploadDocument · BL-35/BL-36", () => {
  it("BL-35: inserta uploaded_by con el auth user actual", async () => {
    uploadMock.mockResolvedValue({ error: null });
    insertMock.mockReturnValue({ data: { id: "d1" }, error: null });

    const { result } = renderHook(() => useUploadDocument(), { wrapper });
    const file = new File(["x"], "orden.pdf", { type: "application/pdf" });
    await result.current.mutateAsync({
      file,
      entityType: "supplier",
      entityId: "s-1",
    });

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const row = insertMock.mock.calls[0][0] as { uploaded_by: string };
    expect(row.uploaded_by).toBe(USER_ID);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("BL-36: si el INSERT falla, elimina el archivo del bucket (sin huérfanos)", async () => {
    uploadMock.mockResolvedValue({ error: null });
    insertMock.mockReturnValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });

    const { result } = renderHook(() => useUploadDocument(), { wrapper });
    const file = new File(["x"], "cfdi.xml", { type: "text/xml" });
    await expect(
      result.current.mutateAsync({
        file,
        entityType: "supplier",
        entityId: "s-1",
      }),
    ).rejects.toBeTruthy();

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledTimes(1);
    const removedPaths = removeMock.mock.calls[0][0] as string[];
    expect(removedPaths[0]).toMatch(/^supplier\/s-1\/\d+_cfdi\.xml$/);
  });

  it("no llama a remove si el upload al bucket falla", async () => {
    uploadMock.mockResolvedValue({ error: { message: "denied" } });

    const { result } = renderHook(() => useUploadDocument(), { wrapper });
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    await expect(
      result.current.mutateAsync({
        file,
        entityType: "forklift",
        entityId: "f-1",
      }),
    ).rejects.toBeTruthy();

    expect(insertMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });
});
