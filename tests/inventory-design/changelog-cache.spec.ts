import { QueryClient, dehydrate } from "@tanstack/react-query";
import { test, expect } from "@playwright/test";
import { installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

for (const format of ["legacy", "versionada"] as const) {
  test(`historial actual con índices persistidos de versión anterior (${format})`, async ({ page, context, baseURL }, info) => {
    const origin = new URL(baseURL!).origin;
    const ledger = await installGroupCTransport(context, origin);
    const release = ledger.provenance.version;
    const scope = "00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002:internal";
    const previous = new QueryClient();
    const oldEntry = { version: "1.0.0", date: "2020-01-01", type: "patch", title: "Índice anterior persistido QA" };
    previous.setQueryData(format === "legacy" ? ["changelog", "list"] : ["changelog", "list", { release: "1.0.0" }], [oldEntry]);
    previous.setQueryData(["changelog", "list", { scope: "archive", ...(format === "versionada" ? { release: "1.0.0" } : {}) }], [oldEntry]);
    const stored = { timestamp: Date.now(), buster: scope, clientState: dehydrate(previous) };
    previous.clear();
    await context.addInitScript(({ origin, scope, stored }) => {
      if (location.origin !== origin || localStorage.getItem("qa:changelog-seeded")) return;
      localStorage.setItem(`liftgo:rq-cache:v4:${scope}`, JSON.stringify(stored));
      localStorage.setItem("qa:changelog-seeded", "true");
    }, { origin, scope, stored });
    const indexReads: string[] = [];
    await context.route(/\/changelog(?:-recent)?\.json(?:\?|$)/, route => {
      const url = new URL(route.request().url());
      expect(url.origin).toBe(origin);
      expect(url.searchParams.get("release")).toBe(release);
      indexReads.push(url.pathname);
      return route.fallback();
    });
    try {
      await page.goto("/changelog");
      await expect(page.getByText(new RegExp(`Versión actual: v${release.replaceAll(".", "\\.")}`))).toBeVisible();
      await expect(page.getByRole("heading", { name: oldEntry.title })).toHaveCount(0);
      expect(indexReads).toEqual(["/changelog-recent.json"]);
      const currentButton = page.getByRole("button", { name: new RegExp(`^v${release.replaceAll(".", "\\.")} Parche`) });
      await currentButton.click();
      await expect(page.locator(`[id="detail-${release}"]`)).toBeVisible();
      await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-changelog-${format}.png`, fullPage: false });
      await page.getByRole("button", { name: "Ver historial completo", exact: true }).click();
      await expect(page.getByRole("button", { name: "Ver historial completo", exact: true })).toHaveCount(0);
      await expect(page.getByText(new RegExp(`Versión actual: v${release.replaceAll(".", "\\.")}`))).toBeVisible();
      await expect(page.getByText(/Versión actual:.*entradas$/)).toBeVisible();
      expect(indexReads).toEqual(["/changelog-recent.json", "/changelog.json"]);
      await expect.poll(() => page.evaluate(({ scope, release }) => {
        const saved = JSON.parse(localStorage.getItem(`liftgo:rq-cache:v4:${scope}`) ?? "null");
        return saved?.clientState?.queries?.filter((query: { queryKey: unknown[] }) =>
          query.queryKey[0] === "changelog" && (query.queryKey[2] as { release?: string })?.release === release).length;
      }, { scope, release })).toBe(2);
      await page.reload();
      await expect(page.getByText(new RegExp(`Versión actual: v${release.replaceAll(".", "\\.")}`))).toBeVisible();
      await expect(page.getByRole("heading", { name: oldEntry.title })).toHaveCount(0);
      expect(indexReads).toEqual(["/changelog-recent.json", "/changelog.json"]);
    } finally {
      expect(await closeOfflinePages(context)).toEqual([]);
      expect(ledger.unexpected).toEqual([]);
      expect(ledger.pageErrors).toEqual([]);
      const allowed = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
      expect(ledger.externalBlocked.filter(request => !allowed.has(request))).toEqual([]);
    }
  });
}
