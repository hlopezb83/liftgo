import { expect, type Locator, type Page } from "@playwright/test";
import { test, fitsViewport, noHorizontalOverflow } from "./mobileTest";
import { invoiceListFixtures } from "./invoiceListFixtures";

test("Entregas: visible search and filter summary work with the panel closed", async ({ page }) => {
  await page.goto("/deliveries?status=scheduled&type=delivery");
  const search = page.getByRole("searchbox", { name: "Buscar entregas…" });
  await fitsViewport(page, search);
  const summary = page.getByRole("list", { name: "Filtros activos" });
  await expect(summary).toContainText("Estado: Programadas");
  await expect(summary).toContainText("Tipo: Entrega");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await search.fill("sin-coincidencias-qa");
  await expect(page.getByText("No hay resultados con los filtros actuales")).toBeVisible();
  await expect(summary).toContainText("Búsqueda: sin-coincidencias-qa");
  await page.getByRole("button", { name: "Limpiar filtros activos", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(search).toHaveValue("");
  await expect(page.getByRole("link", { name: "Ver entrega QA-ENT-001" })).toBeVisible();
  await expect(summary).toHaveCount(0);
  await expect(search).toBeFocused();
  await noHorizontalOverflow(page);
});

async function assertCard(page: Page, item: Locator, expected: string[]) {
  await fitsViewport(page, item);
  await expect(item.getByRole("group", { name: "Cobro" })).toContainText(expected[0]);
  await expect(item.getByRole("group", { name: "CFDI" })).toContainText(expected[1]);
}

async function assertHeaders(page: Page) {
  await expect(page.getByRole("columnheader", { name: "Cobro" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "CFDI" })).toBeVisible();
}

test.describe("Facturas: independent collection and fiscal evidence", () => {
  test.use({ profile: "invoice-list" });
  for (const desktop of [false, true]) {
    test(`${desktop ? "table" : "cards"}: lightweight states and currency`, async ({ page }) => {
      if (desktop) await page.setViewportSize({ width: 1280, height: 900 });
      const reads: URL[] = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.pathname === "/rest/v1/invoices") reads.push(url);
      });
      await page.goto("/invoices");
      const expected = [["Parcial", "Timbrada"], ["Pagado", "Sin timbrar"], ["Sin pagar", "Cancelada"], ["Sin pagar", "Cancelación en proceso"]];
      for (const [index, fixture] of invoiceListFixtures.entries()) {
        const item = desktop
          ? page.getByRole("row").filter({ hasText: fixture.invoice_number })
          : page.getByRole("link", { name: `Ver factura ${fixture.invoice_number} de ${fixture.customer_name}` });
        await expect(item).toContainText(expected[index][0]);
        await expect(item).toContainText(expected[index][1]);
        await expect(item).toContainText("1,234.56");
        if (!desktop) await assertCard(page, item, expected[index]);
      }
      await expect(page.getByText("USD", { exact: true })).toBeVisible();
      if (desktop) await assertHeaders(page);
      expect(reads).toHaveLength(1);
      const fields = reads[0].searchParams.get("select")?.split(",").map((field) => field.trim());
      expect(fields).toEqual(expect.arrayContaining(["cfdi_status", "cancellation_status"]));
      expect(fields).not.toContain("line_items");
      expect(fields).not.toContain("cfdi_xml");
      expect(reads[0].searchParams.has("id")).toBe(false);
      await noHorizontalOverflow(page);
    });
  }

  test("fiscal filters agree with accepted and pending cancellation labels", async ({ page }) => {
    await page.goto("/invoices");
    for (const choice of [
      { value: "Cancelada", number: "QA-FAC-043", filter: "cancelled" },
      { value: "Cancelación en proceso", number: "QA-FAC-044", filter: "cancellation_pending" },
      { value: "Timbrada", number: "QA-FAC-041", filter: "stamped" },
    ]) {
      await page.getByRole("button", { name: /^Filtros/ }).click();
      await page.getByRole("combobox", { name: "Filtrar por estado CFDI" }).click();
      await page.getByRole("option", { name: `CFDI: ${choice.value}`, exact: true }).click();
      await page.getByRole("button", { name: "Cerrar", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`cfdi=${choice.filter}`));
      await expect(page.getByRole("list", { name: "Filtros activos" })).toContainText(`CFDI: ${choice.value}`);
      const cards = page.getByRole("link", { name: /^Ver factura QA-FAC-/ });
      await expect(cards).toHaveCount(1);
      await expect(cards).toContainText(choice.number);
      await expect(cards.getByRole("group", { name: "CFDI" })).toContainText(choice.value);
    }
    await page.getByRole("button", { name: "Limpiar filtros activos", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("list", { name: "Filtros activos" })).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Buscar facturas…", exact: true })).toBeFocused();
    await noHorizontalOverflow(page);
  });
});
