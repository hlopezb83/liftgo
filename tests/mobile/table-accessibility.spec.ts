import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./mobileTest";
import { portalInvoices, portalQuotes } from "./offlineDispatcher";

test.use({ profile: "portal" });

async function tabTo(page: Page, target: Locator) {
  for (let tabs = 0; tabs < 25; tabs++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) break;
  }
  await expect(target).toBeFocused();
}

for (const list of [
  { path: "/portal/invoices", heading: "Mis Facturas", number: portalInvoices[0].invoice_number, id: portalInvoices[0].id },
  { path: "/portal/quotes", heading: "Mis Cotizaciones", number: portalQuotes[0].quote_number, id: portalQuotes[0].id },
]) {
  test(`${list.heading}: tabla nativa y folio navegable con teclado`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(list.path);
    await expect(page.getByRole("heading", { name: list.heading, exact: true })).toBeVisible();
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(3);
    await expect(table.locator('tr[role="button"], tr[tabindex]')).toHaveCount(0);
    const row = table.getByRole("row").filter({ hasText: list.number });
    const link = row.getByRole("link", { name: new RegExp(list.number) });
    await expect(link).toHaveAttribute("href", `${list.path}/${list.id}`);
    await tabTo(page, link);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${list.path}/${list.id}/?$`));
    await expect(page.getByRole("heading", { name: list.number, exact: true })).toBeVisible();
    await page.goBack();
    await expect(table).toBeVisible();
    await expect(link).toBeVisible();
  });
}
