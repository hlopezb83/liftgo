import { expect, test } from "@playwright/test";
import { closeOfflinePages } from "../offlineTeardown";
import { installMaintenanceAudit, mechanicName } from "./audit8-maintenance.fixtures";

test("an order archived after opening rejects labor and keeps the draft", async ({ page, context, baseURL }, info) => {
  const transport = await installMaintenanceAudit(context, new URL(baseURL!).origin);
  try {
    await page.goto("/maintenance");
    await page.getByText("Inspección de Rutina", { exact: true }).click();
    const detail = page.getByRole("dialog", { name: "Inspección de Rutina", exact: true });
    const labor = detail.getByRole("heading", { name: "Mano de Obra", exact: true }).locator("../..");
    await labor.getByRole("combobox").click();
    await page.getByRole("option", { name: mechanicName, exact: true }).click();
    await labor.getByPlaceholder("Horas", { exact: true }).fill("2");
    await labor.getByPlaceholder("Tarifa/hr", { exact: true }).fill("50");
    transport.state.archived = true;
    await labor.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(page.getByText("Error al agregar mano de obra", { exact: true })).toBeVisible();
    await expect(labor.getByPlaceholder("Horas", { exact: true })).toHaveValue("2");
    await expect(labor.getByPlaceholder("Tarifa/hr", { exact: true })).toHaveValue("50");
    await expect(labor.getByText("Sin mano de obra registrada.", { exact: true })).toBeVisible();
    await expect(page.getByText("Mano de obra registrada", { exact: true })).toHaveCount(0);
    expect(transport.state.writes).toHaveLength(1);
    expect(transport.state.writes[0].endpoint).toBe("maintenance_labor");
    await page.screenshot({ path: info.outputPath("archived-order-rejection.png"), animations: "disabled" });
  } finally {
    const teardownErrors = await closeOfflinePages(context);
    await info.attach("maintenance-offline-network", { contentType: "application/json", body: JSON.stringify({ ...transport.audit, ...transport.state, teardownErrors }) });
    expect(teardownErrors).toEqual([]);
    expect(transport.audit.unexpected).toEqual([]);
    expect(transport.audit.pageErrors).toEqual([]);
  }
});
