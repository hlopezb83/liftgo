import { test, expect } from "@playwright/test";

test("historical evidence preserves logistics status and fits the viewport", async ({ page }, testInfo) => {
  await page.goto("/tests/historical-deliveries-browser/index.html");
  await expect(page.getByRole("heading", { name: "Historial de entregas" })).toBeVisible();
  await expect(page.getByText("Conciliada históricamente")).toHaveCount(3);
  await expect(page.getByText("Programada", { exact: true })).toBeVisible();
  await expect(page.getByText("Venta de equipo", { exact: true })).toBeVisible();
  await expect(page.getByText("Fecha de referencia autorizada")).toHaveCount(2);
  await expect(page.getByText(/Atrasada/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Ver entrega ENT-QA" }).focus();
  await expect(page.getByRole("link", { name: "Ver entrega ENT-QA" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("historical-deliveries.png"), fullPage: true });
});
