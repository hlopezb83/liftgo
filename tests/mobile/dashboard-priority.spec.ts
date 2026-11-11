import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { dashboardEquipment, installOfflineDashboard, type DashboardProfile } from "./dashboardOffline";
import { fitsViewport, noHorizontalOverflow } from "./mobileTest";

const test = base.extend<{
  dashboardProfile: DashboardProfile;
  dashboardBackend: Awaited<ReturnType<typeof installOfflineDashboard>>;
  dashboardErrors: string[];
}>({
  dashboardProfile: ["dispatcher", { option: true }],
  dashboardBackend: [async ({ context, baseURL, dashboardProfile }, use) => {
    if (!baseURL) throw new Error("A local application origin is required");
    const backend = await installOfflineDashboard(context, new URL(baseURL).origin, dashboardProfile);
    await use(backend);
    expect(backend.unexpected, "unexpected backend operations").toEqual([]);
  }, { auto: true }],
  dashboardErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(errors);
    expect(errors, "uncaught browser errors").toEqual([]);
  }, { auto: true }],
});

async function beforeInDom(first: Locator, second: Locator) {
  const secondId = await second.getAttribute("aria-label");
  expect(await first.evaluate((element, label) => {
    const next = document.querySelector(`section[aria-label="${label}"]`);
    return !!next && !!(element.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING);
  }, secondId)).toBe(true);
}

async function checkTileContents(page: Page, tile: Locator) {
  await fitsViewport(page, tile);
  const contents = await tile.locator("p").evaluateAll((elements) => elements.map((element) => ({
    text: element.textContent, scroll: element.scrollWidth, client: element.clientWidth,
    height: element.scrollHeight, visibleHeight: element.clientHeight,
  })));
  for (const content of contents) {
    expect(content.scroll, JSON.stringify(content)).toBeLessThanOrEqual(content.client + 1);
    expect(content.height, JSON.stringify(content)).toBeLessThanOrEqual(content.visibleHeight + 1);
  }
}

type Backend = Awaited<ReturnType<typeof installOfflineDashboard>>;
const profileChecks = {
  dispatcher: async (page: Page, pending: Locator, _operations: Locator, dashboardBackend: Backend) => {
    await expect(pending.getByRole("region").first()).toContainText("Transportes atrasados");
    await expect(page.getByRole("region", { name: "Indicadores financieros" })).toHaveCount(0);
    await expect(page.getByText("QA-PANEL-FAC-001", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Cobranza por vencimiento", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Ingreso Mensual Recurrente", { exact: true })).toHaveCount(0);
    expect(dashboardBackend.observed.has("get_financial_kpis")).toBe(false);
    expect(dashboardBackend.observed.has("list_invoices_with_balance")).toBe(false);
  },
  admin: async (page: Page, pending: Locator, operations: Locator, dashboardBackend: Backend) => {
    const financial = page.getByRole("region", { name: "Indicadores financieros", exact: true });
    await expect(financial).toBeVisible();
    await beforeInDom(pending, financial);
    await beforeInDom(financial, operations);
    await expect(pending.getByRole("region").first()).toContainText("QA-PANEL-FAC-001");
    await expect(page.getByText("QA-PANEL-FAC-001", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Cobranza por vencimiento", { exact: true })).toHaveCount(1);
    const mrr = financial.getByRole("link", { name: /Ingreso Mensual Recurrente/ });
    await expect(mrr).toContainText("987,654,321.98");
    await expect(mrr).toHaveAttribute("href", "/mrr");
    await checkTileContents(page, mrr);
    await expect(mrr.locator("svg").last()).toBeVisible();
    await mrr.focus();
    await mrr.press("Tab");
    await expect(financial.getByRole("link", { name: /Flota comprometida hoy/ })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(mrr).toBeFocused();
    expect(dashboardBackend.observed.has("get_financial_kpis")).toBe(true);
  },
};

for (const profile of ["dispatcher", "admin"] as const) {
  test.describe(profile, () => {
    test.use({ dashboardProfile: profile });

    test("prioridad, permisos, orden de lectura y contenido largo", async ({ page, dashboardBackend }, info) => {
      await page.goto("/");
      const pending = page.getByRole("region", { name: profile === "admin" ? "Pendientes de cobranza" : "Pendientes de despacho", exact: true });
      const operations = page.getByRole("region", { name: "Indicadores de operación", exact: true });
      await expect(pending).toBeVisible();
      await expect(operations).toBeVisible();
      await beforeInDom(pending, operations);
      const transport = pending.getByRole("region", { name: /Transportes atrasados/ });
      await expect(transport).toHaveCount(1);
      await expect(transport).toContainText("4");
      await expect(pending.getByRole("link", { name: new RegExp(dashboardEquipment) })).toHaveCount(1);
      expect(dashboardBackend.observed.has("get_dashboard_stats")).toBe(true);

      await profileChecks[profile](page, pending, operations, dashboardBackend);
      await noHorizontalOverflow(page);
      // Keyboard checks can scroll to a lower KPI; capture the actual top too.
      await page.getByRole("heading", { name: "Panel", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`${profile}-dashboard.png`), fullPage: true });
      // The app scrolls its main region; fullPage alone captures only its top.
      await page.getByRole("region", { name: profile === "admin" ? "Indicadores financieros" : "Indicadores de operación", exact: true })
        .screenshot({ path: info.outputPath(`${profile}-kpis.png`) });
    });
  });
}
