import { test, expect, type Locator } from "@playwright/test";

/**
 * Al seleccionar la fecha inicial el calendario re-pinta las celdas (preview
 * del rango), por lo que Playwright puede ver el botón como "inestable" o
 * "detached". Esperamos a que esté visible y forzamos el clic.
 */
async function clickDay(day: Locator): Promise<void> {
  await day.waitFor({ state: "visible", timeout: 5_000 });
  await day.click({ force: true, timeout: 10_000 });
}

/**
 * Regresión Sprint J — DateRangePickerField.
 *
 * Bug v7.71.2: al envolver el trigger en un functional component dentro de
 * `<DialogTrigger asChild>`, Radix Slot no podía inyectar `onClick` y el
 * calendario no abría en /quotes/new. El fix hace el `<Button>` inline.
 *
 * Este spec verifica que el picker abre, muestra un calendario navegable y
 * permite seleccionar un rango sin errores en consola.
 *
 * v7.72.1: tras migrar `Calendar` a react-day-picker v10 + formatters de
 * `Intl.DateTimeFormat("es-MX")`, el aria-name de las `gridcell` puede incluir
 * el mes/año completo. Localizamos los días por texto del botón interno.
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

    // Selecciona el día 5 y luego el 20 del mes visible. En rdp v10 el
    // día se pinta dentro de un <button> descendiente de la gridcell.
    const dayButton = (n: number) =>
      grid.locator("button").filter({ hasText: new RegExp(`^\\s*${n}\\s*$`) }).first();

    await clickDay(dayButton(5));
    await clickDay(dayButton(20));

    // No debe haber errores en consola (RangeError de date-fns v4).
    expect(errors, `Errores JS: ${errors.join(" | ")}`).toEqual([]);
  });
});

/**
 * R9-P2-07: el filtro de rango se aplica solo al completar la selección
 * (antes hacía falta un tercer clic en "Aplicar").
 */
test.describe("DateRangePickerField auto-aplicación", () => {
  test("cierra el popover al completar el rango, sin botón Aplicar", async ({ page }) => {
    await page.goto("/quotes/new", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /cotizaci/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const trigger = page
      .getByRole("button", { name: /periodo|rango|fecha/i })
      .filter({ hasText: /-|selecc/i })
      .first();
    await trigger.click();

    const grid = page.getByRole("grid").first();
    await expect(grid).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /^aplicar$/i })).toHaveCount(0);

    const dayButton = (n: number) =>
      grid.locator("button").filter({ hasText: new RegExp(`^\\s*${n}\\s*$`) }).first();
    await clickDay(dayButton(5));
    await clickDay(dayButton(20));

    await expect(grid).toBeHidden({ timeout: 5_000 });
  });
});
