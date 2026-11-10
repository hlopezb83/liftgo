import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { persistQueryClientRestore, persistQueryClientSave } from "@tanstack/react-query-persist-client";
import { describe, expect, it, vi } from "vitest";

import { createBrowserPersister, shouldPersistQuery } from "../persister";

// Synthetic catalogs only: exercise the installed SDK without a backend.
describe("query upgrade lifecycle", () => {
  it("restores a persisted catalog, invalidates it, and refetches when reopened", async () => {
    vi.useFakeTimers();
    const scope = "upgrade-qa-user:upgrade-qa-org";
    const persister = createBrowserPersister(scope, localStorage);
    const first = new QueryClient();
    const reopened = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let unsubscribe: (() => void) | undefined;
    try {
      localStorage.clear();
      first.setQueryData(["forklifts", "upgrade-qa"], [{ id: "demo-1", revision: 1 }]);
      first.setQueryData(["billing_secrets_status"], { synthetic: true });
      await persistQueryClientSave({ queryClient: first, persister, buster: "upgrade-qa", dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery } });
      await vi.advanceTimersByTimeAsync(1100);
      await persistQueryClientRestore({ queryClient: reopened, persister, buster: "upgrade-qa" });
      expect(reopened.getQueryData(["forklifts", "upgrade-qa"])).toEqual([{ id: "demo-1", revision: 1 }]);
      expect(reopened.getQueryData(["billing_secrets_status"])).toBeUndefined();
      await reopened.invalidateQueries({ queryKey: ["forklifts"] });
      expect(reopened.getQueryState(["forklifts", "upgrade-qa"])?.isInvalidated).toBe(true);
      const fetchCatalog = vi.fn().mockResolvedValue([{ id: "demo-1", revision: 2 }]);
      const observer = new QueryObserver(reopened, { queryKey: ["forklifts", "upgrade-qa"], queryFn: fetchCatalog });
      unsubscribe = observer.subscribe(() => undefined);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchCatalog).toHaveBeenCalledTimes(1);
      expect(reopened.getQueryData(["forklifts", "upgrade-qa"])).toEqual([{ id: "demo-1", revision: 2 }]);
    } finally {
      unsubscribe?.();
      first.clear();
      reopened.clear();
      localStorage.clear();
      vi.useRealTimers();
    }
  });
});
