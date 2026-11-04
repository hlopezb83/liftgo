import { test, expect, type Page } from "@playwright/test";

const base = "/tests/quote-charge-review-browser/index.html";
async function open(page: Page, query = "") {
  await page.goto(base + query);
  await page.getByRole("button", { name: "Revisar historial de cargos" }).click();
  await expect(page.getByRole("link", { name: "FAC-QA" })).toBeVisible();
}
async function fill(page: Page) {
  await page.getByRole("button", { name: "Revisar partida", exact: true }).click();
  await expect(page.getByLabel("Clasificación revisada")).toHaveValue("");
  await page.getByLabel("Clasificación revisada").selectOption("charge");
  await page.getByLabel("Cargo de COT-QA").selectOption("12300000-0000-4000-8000-000000000110");
  await page.getByLabel("Cantidad histórica a vincular").fill("1");
  await page.getByLabel("Motivo obligatorio").fill("Entrega comprobada");
  await page.getByLabel("Evidencia revisada obligatoria").fill("Documento sintético");
}
test("cancel, close, reopen and successful review preserve focus and original evidence", async ({ page }, info) => {
  await open(page); await fill(page);
  await page.getByRole("button", { name: "Cancelar revisión", exact: true }).click();
  await expect(page.getByRole("button", { name: "Revisar partida", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar revisión", exact: true }).click();
  await expect(page.getByRole("button", { name: "Revisar historial de cargos" })).toBeFocused();
  await page.getByRole("button", { name: "Revisar historial de cargos" }).click();
  await fill(page);
  await page.screenshot({ path: info.outputPath("review-form.png"), fullPage: true });
  await page.getByRole("button", { name: "Guardar conciliación" }).click();
  await expect(page.getByRole("button", { name: "Revertir revisión", exact: true })).toBeVisible();
  await expect(page.getByText("Partida 1: Partida histórica de entrega", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { quoteChargeReviewEvents: unknown[] }).quoteChargeReviewEvents.length)).toBe(1);
});
test("save error retry retains request key and prevents pending close", async ({ page }) => {
  await open(page, "?mode=save-error"); await fill(page);
  await page.getByRole("button", { name: "Guardar conciliación" }).click();
  await expect(page.getByRole("alert")).toContainText("Fallo simulado");
  await page.getByRole("button", { name: "Guardar conciliación" }).click();
  await expect(page.getByRole("button", { name: "Revertir revisión", exact: true })).toBeVisible();
  const events = await page.evaluate(() => (window as unknown as { quoteChargeReviewEvents: Array<{ requestKey: string }> }).quoteChargeReviewEvents);
  expect(events).toHaveLength(2); expect(events[0].requestKey).toBe(events[1].requestKey);
  await open(page, "?mode=slow"); await fill(page);
  await page.getByRole("button", { name: "Guardar conciliación" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Revertir revisión", exact: true })).toBeVisible();
});
test("query errors recover and audit role cannot reconcile", async ({ page }) => {
  await page.goto(base + "?mode=query-error");
  await page.getByRole("button", { name: "Revisar historial de cargos" }).click();
  await expect(page.getByRole("alert")).toContainText("Consulta simulada");
  await page.getByRole("button", { name: "Reintentar consulta" }).click();
  await expect(page.getByRole("button", { name: "Revisar partida", exact: true })).toBeVisible();
  await open(page, "?role=auditor");
  await expect(page.getByText(/Cancelación: pending/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Revisar partida", exact: true })).toHaveCount(0);
});
