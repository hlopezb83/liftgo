import { test, expect } from "@playwright/test";

/**
 * Regresión Sprint J — DateRangePickerField.
 *
 * Bug v7.71.2: al envolver el trigger en un functional component dentro de
 * `<DialogTrigger asChild>`, Radix Slot no podía inyectar `onClick` y el
 * calendario no abría en /quotes/new. El fix hace el `<Button>` inline.
 *
 * Este spec verifica que el picker abre, muestra un calendario navegable y
 * permite seleccionar un rango sin errores en consola.
 */
test.describe("DateRangePickerField", () => {
  test("abre desde /quotes/new y permite seleccionar un rango", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/quotes/new", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /cotizaci/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const trigger = page
      .getByRole("button", { name: /periodo|rango|fecha/i })
      .filter({ hasText: /-|selecc/i })
      .first();
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    // Calendario visible (react-day-picker usa role="grid").
    const grid = page.getByRole("grid").first();
    await expect(grid).toBeVisible({ timeout: 5_000 });

    // Selecciona el día 5 y luego el 20 del mes visible.
    await grid.getByRole("gridcell", { name: /^5$/ }).first().click();
    await grid.getByRole("gridcell", { name: /^20$/ }).first().click();

    // No debe haber errores en consola (RangeError de date-fns v4).
    expect(errors, `Errores JS: ${errors.join(" | ")}`).toEqual([]);
  });
});
