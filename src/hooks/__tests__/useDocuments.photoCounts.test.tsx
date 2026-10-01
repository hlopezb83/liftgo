import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  document: null as null | { id: string; entity_type: string; file_url: string },
  remove: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) },
    rpc: async () => ({ data: "2f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123", error: null }),
    storage: { from: () => ({
      upload: async () => ({ error: null }),
      remove: state.remove,
    }) },
    from: () => ({
      insert: (row: { entity_type: string; file_url: string }) => ({
        select: () => ({ single: async () => {
          state.document = { id: "photo-1", ...row };
          return { data: state.document, error: null };
        } }),
      }),
      select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: state.document, error: null }),
      }) }),
      delete: () => ({ eq: async () => {
        state.document = null;
        return { error: null };
      } }),
    }),
  },
}));

import { useDeleteDocument, useUploadDocument } from "../useDocuments";

beforeEach(() => {
  state.document = null;
  state.remove.mockReset().mockResolvedValue({ error: null });
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000 } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => ({
    count: useQuery({
      queryKey: ["damage_photo_counts", "test-org"],
      queryFn: async () => state.document?.entity_type === "damage_record" ? 1 : 0,
    }),
    upload: useUploadDocument(),
    remove: useDeleteDocument(),
  }), { wrapper });
}

describe("Damage attachment photo counts", () => {
  it("actualiza el contador ya cargado al subir y eliminar una foto, sin recargar la página", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.count.data).toBe(0));
    await act(async () => {
      await result.current.upload.mutateAsync({
        file: new File(["image"], "panel.png", { type: "image/png" }),
        entityType: "damage_record", entityId: "damage-1",
      });
    });
    await waitFor(() => expect(result.current.count.data).toBe(1));

    await act(async () => { await result.current.remove.mutateAsync("photo-1"); });
    await waitFor(() => expect(result.current.count.data).toBe(0));
    expect(state.remove).toHaveBeenCalledTimes(1);
  });
});
