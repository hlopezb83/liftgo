import { test, expect, type Locator } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * Al seleccionar la fecha inicial el calendario re-pinta las celdas (preview
 * del rango), por lo que Playwright puede ver el botón como "inestable" o
 * "detached". Esperamos a que esté visible y forzamos el clic.
 */
async function clickDay(day: Locator): Promise<void> {
  await day.waitFor({ state: "visible", timeout: TIMEOUTS.short });
  // eslint-disable-next-line playwright/no-force-option -- el repintado del rango marca el día como "inestable"; el clic forzado es intencional.
  await day.click({ force: true, timeout: TIMEOUTS.medium });
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
      timeout: TIMEOUTS.long,
    });

    // v7.323.1: tras DatePickerMx el trigger es un botón de ícono con
    // aria-label "Abrir calendario de …" (ya no muestra el texto del rango).
    const trigger = page
      .getByRole("button", { name: /abrir calendario/i })
      .first();
    await expect(trigger).toBeVisible({ timeout: TIMEOUTS.medium });
    await trigger.click();

    // Calendario visible (react-day-picker usa role="grid").
    const grid = page.getByRole("grid").first();
    await expect(grid).toBeVisible({ timeout: TIMEOUTS.short });

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
 * R10-FE-02: el primer clic (from == to) es selección PARCIAL y no cierra el
 * diálogo; un rango real (from != to) se auto-aplica; existe botón "Aplicar"
 * para confirmar rangos de un solo día.
 */
test.describe("DateRangePickerField auto-aplicación", () => {
  test("primer clic no cierra; rango real auto-aplica y hay botón Aplicar", async ({ page }) => {
    await page.goto("/quotes/new", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /cotizaci/i }).first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });

    // v7.323.1: tras DatePickerMx el trigger es un botón de ícono con
    // aria-label "Abrir calendario de …" (ya no muestra el texto del rango).
    const trigger = page
      .getByRole("button", { name: /abrir calendario/i })
      .first();
    await trigger.click();

    const grid = page.getByRole("grid").first();
    await expect(grid).toBeVisible({ timeout: TIMEOUTS.short });
    // R10-FE-02: el botón Aplicar vuelve a existir (deshabilitado sin rango).
    const apply = page.getByRole("button", { name: /^aplicar$/i });
    await expect(apply).toBeVisible();
    await expect(apply).toBeDisabled();

    // Días habilitados del mes visible (evita días fuera de mes o
    // deshabilitados, que hacían que el clic no seleccionara nada en CI).
    const days = grid.locator("button:not([disabled])").filter({ hasText: /^\s*\d+\s*$/ });

    // Primer clic: selección parcial → el diálogo sigue abierto y hay un día
    // marcado como seleccionado (assert de estado, no de texto).
    await clickDay(days.nth(4));
    await expect(grid).toBeVisible();
    await expect(grid.locator('[aria-selected="true"]').first()).toBeVisible({ timeout: TIMEOUTS.short });

    // Segundo clic en otra fecha: rango real → se auto-aplica y cierra.
    await clickDay(days.nth(19));
    await expect(grid).toBeHidden({ timeout: TIMEOUTS.short });
  });
});

