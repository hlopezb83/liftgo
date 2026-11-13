import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";
import { documentsQueries } from "../documentsQueryKeys";

const state = vi.hoisted(() => ({ rows: [] as { id: string; file_url: string }[], sign: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    ...createSupabaseChainMock({ fromResolver: () => ({ data: state.rows, error: null }) }),
    storage: { from: () => ({ createSignedUrls: state.sign }) },
  },
}));
const paths = ["org/forklift/f-1/a.pdf", "org/forklift/f-1/b.pdf"];
const signed = (path: string) => ({ path, signedUrl: `https://storage.example.invalid/storage/v1/object/sign/documents/${path}?token=fixture`, error: null });
const read = () => createQueryWrapper().queryClient.fetchQuery(documentsQueries.list({ entityType: "forklift", entityId: "f-1" }));

beforeEach(() => {
  state.rows = paths.map((path, i) => ({ id: String(i), file_url: `documents/${path}` }));
  state.sign.mockReset().mockResolvedValue({ data: paths.map(signed), error: null });
});

describe("document signed links", () => {
  it("signs relative and legacy Storage URLs, preserving legitimate external URLs", async () => {
    state.rows[1].file_url = `https://storage.example.invalid/storage/v1/object/public/documents/${paths[1]}`;
    state.rows.push({ id: "external", file_url: "https://vendor.example.invalid/manual.pdf" },
      { id: "external-documents", file_url: "https://vendor.example.invalid/documents/manual.pdf" });
    const rows = await read();
    expect(state.sign).toHaveBeenCalledExactlyOnceWith(paths, 3600);
    expect(rows.map(row => row.file_url)).toEqual([signed(paths[0]).signedUrl, signed(paths[1]).signedUrl,
      "https://vendor.example.invalid/manual.pdf", "https://vendor.example.invalid/documents/manual.pdf"]);
  });

  it("does not sign an empty list or an external-only list", async () => {
    state.rows = [];
    expect(await read()).toEqual([]);
    state.rows = [{ id: "external", file_url: "https://vendor.example.invalid/manual.pdf" }];
    expect(await read()).toEqual(state.rows);
    expect(state.sign).not.toHaveBeenCalled();
  });

  it("propagates a failed signing request instead of returning internal paths", async () => {
    const error = new Error("Storage no disponible");
    state.sign.mockResolvedValue({ data: null, error });
    await expect(read()).rejects.toBe(error);
  });

  it.each([
    null,
    [],
    [signed(paths[0])],
    [signed(paths[0]), { path: paths[1], signedUrl: "", error: "not found" }],
    [signed(paths[0]), { ...signed(paths[1]), error: "not authorized" }],
  ])("rejects missing or incomplete signing results: %j", async data => {
    state.sign.mockResolvedValue({ data, error: null });
    await expect(read()).rejects.toThrow(/No se pudieron generar/);
  });
});
