import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { closeOfflinePages } from "../offlineTeardown";
import { installMaintenanceAudit, lastPartId, lastSku } from "./audit8-maintenance.fixtures";

const test = base.extend<{ transport: Awaited<ReturnType<typeof installMaintenanceAudit>> }>({
  transport: [async ({ context, baseURL }, use, info) => {
    const transport = await installMaintenanceAudit(context, new URL(baseURL!).origin);
    try { await use(transport); }
    finally {
      const teardownErrors = await closeOfflinePages(context);
      await info.attach("maintenance-offline-network", { contentType: "application/json",
        body: JSON.stringify({ ...transport.audit, ...transport.state, failTables: [...transport.state.failTables], teardownErrors }) });
      expect(teardownErrors).toEqual([]);
      expect(transport.audit.unexpected).toEqual([]);
      expect(transport.audit.pageErrors).toEqual([]);
    }
  }, { auto: true }],
});

async function openOrder(page: Page) {
  await page.goto("/maintenance");
  await page.getByText("Inspección de Rutina", { exact: true }).click();
  const detail = page.getByRole("dialog", { name: "Inspección de Rutina", exact: true });
  await expect(detail).toBeVisible();
  return {
    detail,
    parts: detail.getByRole("heading", { name: "Refacciones Utilizadas", exact: true }).locator("../.."),
    labor: detail.getByRole("heading", { name: "Mano de Obra", exact: true }).locator("../.."),
  };
}

function errorRetry(root: Locator, message: string) {
  return root.getByText(message, { exact: true }).locator("../..").getByRole("button", { name: "Reintentar", exact: true });
}

test("failed maintenance reads show retryable errors instead of empty records", async ({ page, transport }, info) => {
  transport.state.failTables = new Set(["maintenance_parts", "maintenance_labor", "mechanics"]);
  transport.state.quantity = 2; transport.state.historicalUnitCost = 10; transport.state.showLabor = true;
  const { detail, parts, labor } = await openOrder(page);
  const partsError = "No se pudo cargar las refacciones utilizadas";
  const laborError = "No se pudo cargar la mano de obra";
  const mechanicsError = "No se pudo cargar los mecánicos";
  for (const message of [partsError, laborError, mechanicsError]) await expect(detail.getByText(message, { exact: true })).toBeVisible();
  await expect(parts.getByText("No se han agregado refacciones.", { exact: true })).toHaveCount(0);
  await expect(labor.getByText("Sin mano de obra registrada.", { exact: true })).toHaveCount(0);
  await expect(labor.getByRole("button", { name: "Agregar", exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath("maintenance-read-errors.png"), animations: "disabled" });
  transport.state.failTables.clear();
  await errorRetry(parts, partsError).click();
  await expect(parts.getByText(`(${lastSku})`, { exact: true })).toBeVisible();
  await errorRetry(labor, laborError).click();
  await expect(labor.getByText("Trabajo QA recuperado", { exact: true })).toBeVisible();
  await errorRetry(labor, mechanicsError).click();
  await expect(labor.getByRole("combobox")).toBeEnabled();
  await expect(detail.getByText(/No se pudo cargar/)).toHaveCount(0);
  transport.state.failCatalog = true;
  await parts.getByRole("combobox", { name: "Refacción", exact: true }).click();
  const catalogError = "No se pudo cargar las refacciones disponibles";
  await expect(page.getByText(catalogError, { exact: true })).toBeVisible();
  await expect(page.getByText("No se encontraron refacciones con existencias.", { exact: true })).toHaveCount(0);
  transport.state.failCatalog = false;
  await errorRetry(page.locator("body"), catalogError).click();
  await expect(page.getByRole("option")).toHaveCount(25);
  await expect(page.getByRole("option").filter({ hasText: "QA-SKU-0502" })).toBeVisible();
  expect(transport.state.writes).toEqual([]);
});

test("finds stock beyond 501 rows and adds the same SKU without replacing quantity or cost", async ({ page, transport }, info) => {
  const { parts } = await openOrder(page);
  const picker = parts.getByRole("combobox", { name: "Refacción", exact: true });
  await picker.click();
  await expect(page.getByRole("option")).toHaveCount(25);
  await expect(page.getByText("1 de 21", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByText("2 de 21", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Buscar por nombre o SKU…", { exact: true }).fill(lastSku);
  const option = page.getByRole("option").filter({ hasText: lastSku });
  await expect(option).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(1);
  expect(transport.state.catalogCalls.at(-1)).toMatchObject({ p_search: lastSku, p_page: 0, p_maintenance_stock: true });
  await option.click();
  await expect(parts.getByRole("button", { name: "Agregar", exact: true })).toBeEnabled();
  expect(transport.state.selectedIds).toContain(lastPartId);
  await parts.getByRole("spinbutton", { name: "Cantidad", exact: true }).fill("3");
  await parts.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(parts.getByText("×3", { exact: true })).toBeVisible();
  transport.state.catalogUnitCost = 25;
  await picker.click();
  await expect(option.getByText("$25.00", { exact: true })).toBeVisible();
  await option.click();
  await expect(parts.getByText("Esta OT conserva el costo registrado de $10.00 por unidad.", { exact: true })).toBeVisible();
  await parts.getByRole("spinbutton", { name: "Cantidad", exact: true }).fill("2");
  await parts.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(parts.getByText("×5", { exact: true })).toBeVisible();
  await expect(parts.getByText("$50.00", { exact: true }).last()).toBeVisible();
  expect(transport.state.writes.map(write => write.args.p_quantity)).toEqual([3, 2]);
  expect(transport.state.historicalUnitCost).toBe(10);
  expect(transport.state.remainingStock).toBe(15);
  await page.screenshot({ path: info.outputPath("maintenance-increment-preserves-cost.png"), animations: "disabled" });
});
