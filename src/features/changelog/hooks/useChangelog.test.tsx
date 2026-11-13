import { QueryClient, QueryClientProvider, dehydrate } from "@tanstack/react-query";
import { persistQueryClientRestore } from "@tanstack/react-query-persist-client";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changelogQueries } from "../lib/queryKeys";
import { fetchChangelogIndex } from "../lib/changelog";
import { useChangelog, useChangelogArchive, useChangelogEntry } from "./useChangelog";

const oldEntry = { version: "8.53.9", date: "2026-11-12", type: "patch", title: "Versión anterior" };
const currentEntry = { ...oldEntry, version: "8.53.10", title: "Historial actualizado" };
const clients: QueryClient[] = [];
function makeClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return client;
}

afterEach(() => {
  clients.forEach(client => client.clear());
  clients.length = 0;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("changelog después de una publicación", () => {
  it.each(["legacy", "versionada"])("ignora ambos índices persistidos de una caché %s anterior", async (format) => {
    vi.stubEnv("VITE_APP_VERSION", "8.53.9");
    const previous = makeClient();
    previous.setQueryData(format === "legacy" ? ["changelog", "list"] : changelogQueries.list().queryKey, [oldEntry]);
    previous.setQueryData(format === "legacy" ? ["changelog", "list", { scope: "archive" }] : changelogQueries.list({ scope: "archive" }).queryKey, [oldEntry]);
    previous.setQueryData(["forklifts", "list"], [{ id: "equipo-ficticio" }]);
    const stored = { timestamp: Date.now(), buster: "qa-scope", clientState: dehydrate(previous) };
    vi.stubEnv("VITE_APP_VERSION", "8.53.10");
    const client = makeClient();
    await persistQueryClientRestore({ queryClient: client, buster: "qa-scope", persister: {
      restoreClient: async () => stored, persistClient: async () => {}, removeClient: async () => {},
    } });
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify([currentEntry])));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(({ archive }) => ({ recent: useChangelog(), archive: useChangelogArchive(archive) }), {
      wrapper, initialProps: { archive: false },
    });
    expect(result.current.recent.data).toBeUndefined();
    expect(result.current.archive.data).toBeUndefined();
    await waitFor(() => expect(result.current.recent.data).toEqual([currentEntry]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenLastCalledWith("/changelog-recent.json?release=8.53.10", { cache: "no-store" });
    expect(client.getQueryData(["forklifts", "list"])).toEqual([{ id: "equipo-ficticio" }]);
    rerender({ archive: true });
    await waitFor(() => expect(result.current.archive.data).toEqual([currentEntry]));
    expect(fetchMock).toHaveBeenLastCalledWith("/changelog.json?release=8.53.10", { cache: "no-store" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    rerender({ archive: false });
    await act(async () => { await client.fetchQuery(changelogQueries.list()); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("revalida también el archivo de respaldo si falla el índice reciente", async () => {
    vi.stubEnv("VITE_APP_VERSION", "8.53.10");
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([currentEntry])));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchChangelogIndex()).toEqual([currentEntry]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/changelog-recent.json?release=8.53.10", { cache: "no-store" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/changelog.json?release=8.53.10", { cache: "no-store" });
  });

  it("conserva detalles cacheados por su versión sin volver a descargarlos", async () => {
    const client = makeClient();
    const detail = { description: "Detalle anterior válido", changes: ["Cambio histórico"] };
    client.setQueryData(changelogQueries.detail("8.53.9").queryKey, detail);
    vi.stubEnv("VITE_APP_VERSION", "8.53.10");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useChangelogEntry("8.53.9"), { wrapper });
    expect(result.current.data).toEqual(detail);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
