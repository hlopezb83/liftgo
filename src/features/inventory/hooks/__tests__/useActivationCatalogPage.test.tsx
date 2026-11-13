import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { partInventoryKeys } from "../../lib/queryKeys";
import { fetchActivationCatalogPage, useActivationCatalogPage } from "../useActivationCatalogPage";

const state = vi.hoisted(() => ({
  organization: { status: "ready", organizationId: "org-a", memberType: "internal" } as Record<string, string>,
  identity: "user:org-a:internal" as string | null,
  fetch: vi.fn(), requests: [] as URL[],
}));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => state.organization }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => state.identity }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "test-offline", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) },
  }) };
});

const id = (number: number) => String(number).padStart(5, "0");
const part = (number: number) => ({ id: id(number), sku: `SKU-${id(number)}`, name: `Refacción ${id(number)}`, is_active: true });
let catalog: ReturnType<typeof part>[];
let inventory: Array<{ catalog_part_id: string; organization_id: string; is_active: boolean }>;
let failTable: string | undefined;
const clients: ReturnType<typeof createQueryWrapper>["queryClient"][] = [];
function setup() {
  const { Wrapper, queryClient } = createQueryWrapper();
  clients.push(queryClient);
  return { wrapper: Wrapper, queryClient };
}
const json = (data: unknown, count = 0, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Content-Range": `0-49/${count}` },
});
async function transport(input: RequestInfo | URL) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  state.requests.push(url);
  const table = url.pathname.split("/").at(-1);
  const p = url.searchParams;
  if (table === failTable) return json({ message: "permission denied", code: "42501" }, 0, 403);
  if (table === "parts_catalog") {
    let rows = catalog.filter((row) => p.get("is_active") === `eq.${row.is_active}`);
    if (p.has("id")) rows = rows.filter((row) => p.get("id") === `eq.${row.id}`);
    if (p.has("or")) {
      const pattern = p.get("or")!.slice("(sku.imatch.".length).split(",name.imatch.")[0];
      const regex = new RegExp(JSON.parse(pattern) as string, "i");
      rows = rows.filter((row) => regex.test(row.sku) || regex.test(row.name));
    }
    const offset = Number(p.get("offset") ?? 0);
    const count = rows.length;
    return json(rows.slice(offset, offset + Number(p.get("limit") ?? count)).map(({ id, sku, name }) => ({ id, sku, name })), count);
  }
  if (table === "parts_inventory") {
    const ids = p.get("catalog_part_id")?.slice(4, -1).split(",") ?? [];
    return json(inventory.filter((row) => p.get("organization_id") === `eq.${row.organization_id}`
      && p.get("is_active") === `eq.${row.is_active}` && ids.includes(row.catalog_part_id))
      .map(({ catalog_part_id }) => ({ catalog_part_id })));
  }
  throw new Error(`Unexpected offline table: ${table}`);
}
const options = { open: true, search: "", page: 0, selectedId: "" };
const fetchPage = (patch = {}) => fetchActivationCatalogPage("org-a", { ...options, ...patch }, new AbortController().signal);
beforeEach(() => {
  state.organization = { status: "ready", organizationId: "org-a", memberType: "internal" };
  state.identity = "user:org-a:internal";
  state.requests = [];
  catalog = Array.from({ length: 1001 }, (_, i) => part(i + 1));
  inventory = []; failTable = undefined;
  state.fetch.mockReset().mockImplementation(transport);
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; });

describe("activation catalog, actual PostgREST transport offline", () => {
  it("reaches SKUs beyond 501 and excludes activated IDs beyond the first inventory batch", async () => {
    inventory = catalog.slice(0, 550).map((row) => ({ catalog_part_id: row.id, organization_id: "org-a", is_active: true }));
    // Neither an inactive local row nor another company's active row excludes this SKU.
    inventory.push({ catalog_part_id: id(1001), organization_id: "org-a", is_active: false },
      { catalog_part_id: id(1001), organization_id: "org-b", is_active: true });
    expect((await fetchPage({ page: 10 })).items).toEqual([]);
    expect((await fetchPage({ page: 11 })).items).toHaveLength(50);
    expect(await fetchPage({ page: 20 })).toMatchObject({ items: [expect.objectContaining({ id: id(1001) })], totalCount: 1001, pageIndex: 20 });
    const reads = state.requests.filter((url) => url.pathname.endsWith("/parts_inventory"));
    expect(reads[0].searchParams.get("catalog_part_id")).toContain(id(550));
    for (const read of reads) {
      expect(read.searchParams.get("organization_id")).toBe("eq.org-a");
      expect(read.searchParams.get("select")).toBe("catalog_part_id");
      expect(read.searchParams.get("catalog_part_id")!.split(",").length).toBeLessThanOrEqual(51);
    }
    for (const read of state.requests.filter((url) => url.pathname.endsWith("/parts_catalog"))) {
      expect(read.searchParams.get("limit")).toBe("50");
      expect(read.searchParams.get("order")).toBe("sku.asc,id.asc");
      expect(read.searchParams.get("select")).toBe("id,sku,name");
    }
  });

  it("searches the entire active catalog with literal punctuation and wildcards", async () => {
    const name = 'Kit (A), 100%_ * "x" \\';
    catalog[600].name = name;
    catalog[599].name = "Kit A, 100anything";
    expect((await fetchPage({ search: name })).items).toEqual([expect.objectContaining({ id: id(601) })]);
    expect((await fetchPage({ search: "sku-00601" })).totalCount).toBe(1);
    catalog[600].is_active = false;
    expect((await fetchPage({ search: "sku-00601" })).items).toEqual([]);
  });

  it("resolves the selected ID outside the current search and rechecks its local activation", async () => {
    const selected = id(601);
    expect(await fetchPage({ search: "SKU-00001", selectedId: selected })).toMatchObject({ selected: { id: selected }, totalCount: 1 });
    expect(state.requests.some((url) => url.searchParams.get("id") === `eq.${selected}`)).toBe(true);
    inventory.push({ catalog_part_id: selected, organization_id: "org-a", is_active: true });
    expect((await fetchPage({ search: "SKU-00001", selectedId: selected })).selected).toBeNull();
    catalog[600].is_active = false;
    expect((await fetchPage({ selectedId: selected })).selected).toBeNull();
  });

  it("clamps a page that disappeared after catalog shrinkage", async () => {
    catalog = catalog.slice(0, 10);
    const result = await fetchPage({ page: 10 });
    expect(result.pageIndex).toBe(0);
    expect(result.items).toHaveLength(10);
    expect(state.requests.filter((url) => url.pathname.endsWith("/parts_catalog")).map((url) => url.searchParams.get("offset"))).toEqual(["500", "0"]);
  });

  it("recovers HTTP 416 only after a successful HEAD recount", async () => {
    catalog = catalog.slice(0, 10);
    state.fetch.mockImplementationOnce(async () => json({ code: "PGRST103", message: "Requested range not satisfiable" }, 0, 416));
    const result = await fetchPage({ page: 10 });
    expect(result.pageIndex).toBe(0);
    expect(result.items).toHaveLength(10);
    expect(state.fetch.mock.calls[1][1].method).toBe("HEAD");
    expect(state.requests[0].searchParams.has("offset")).toBe(false);
    expect(state.requests[0].searchParams.has("limit")).toBe(false);
  });

  it("does not treat a failed recount or repeated HTTP 416 as an empty catalog", async () => {
    state.fetch.mockImplementationOnce(async () => json({ code: "PGRST103", message: "Range" }, 0, 416));
    state.fetch.mockImplementationOnce(async () => json({ code: "42501", message: "Denied" }, 0, 403));
    await expect(fetchPage({ page: 10 })).rejects.toMatchObject({ message: "Denied" });
    state.fetch.mockImplementationOnce(async () => json({ code: "PGRST103", message: "Range" }, 0, 416));
    state.fetch.mockImplementationOnce(async () => json([], 10));
    state.fetch.mockImplementationOnce(async () => json({ code: "PGRST103", message: "Range again" }, 0, 416));
    await expect(fetchPage({ page: 10 })).rejects.toMatchObject({ code: "PGRST103" });
  });

  it.each(["parts_catalog", "parts_inventory"])("fails closed if %s cannot be verified", async (table) => {
    failTable = table;
    const { result } = renderHook(() => useActivationCatalogPage(options), setup());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isReady).toBe(false);
  });

  it("does not query closed dialogs or an unverified organization", async () => {
    const { result, rerender } = renderHook(({ open }) => useActivationCatalogPage({ ...options, open }), { ...setup(), initialProps: { open: false } });
    expect(state.fetch).not.toHaveBeenCalled();
    state.identity = null;
    state.organization = { status: "error" };
    rerender({ open: true });
    expect(result.current.isError).toBe(true);
    expect(state.fetch).not.toHaveBeenCalled();
    state.identity = "user:org-a:internal";
    state.organization = { status: "ready", organizationId: "org-a", memberType: "internal" };
    rerender({ open: true });
    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it("shares inventory invalidation and hides cached eligibility when refresh fails", async () => {
    const config = setup();
    const { result } = renderHook(() => useActivationCatalogPage({ ...options, selectedId: id(1) }), config);
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.data?.selected?.id).toBe(id(1));
    failTable = "parts_inventory";
    await act(() => config.queryClient.invalidateQueries({ queryKey: partInventoryKeys.all }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    failTable = undefined;
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it("aborts obsolete searches and ignores late responses across search and identity changes", async () => {
    let release!: () => void;
    let signal: AbortSignal | undefined;
    state.fetch.mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      await new Promise<void>((resolve) => { release = resolve; });
      return transport(input);
    });
    const { result, rerender } = renderHook(({ search }) => useActivationCatalogPage({ ...options, search }), { ...setup(), initialProps: { search: "SKU-00001" } });
    await waitFor(() => expect(release).toBeDefined());
    state.identity = "other-user:org-b:internal";
    state.organization = { status: "ready", organizationId: "org-b", memberType: "internal" };
    rerender({ search: "SKU-00601" });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(signal?.aborted).toBe(true);
    expect(result.current.data?.items[0].id).toBe(id(601));
    await act(async () => { release(); await Promise.resolve(); });
    expect(result.current.data?.items[0].id).toBe(id(601));
    expect(state.requests.some((url) => url.searchParams.get("organization_id") === "eq.org-b")).toBe(true);
  });
});
