import { test, expect } from "./fixtures/seed";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * Smoke E2E del Kanban de Mantenimiento.
 *
 * El RPC `e2e_seed_scenario` siembra una orden de mantenimiento con
 * `work_status = 'pending'` vinculada al montacargas E2E. Este spec navega a
 * /maintenance y verifica que:
 *   1. La tarjeta aparece en la columna "pending" (selector por data-testid
 *      estable, no por texto en español).
 *   2. Enter en el botón de apertura abre el detalle y Escape devuelve el foco.
 *
 * Las transiciones entre columnas se verifican en los tests de
 * `useMaintenanceKanban`.
 */
test("seeded maintenance work order appears in pending column", async ({ page, seed }) => {
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text()); });

  await page.goto("/maintenance", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});

  // Vista por defecto es "list". Activamos el toggle "board" (Kanban) via su
  // aria-label estable. Espera explícita a que el toolbar esté hidratado antes
  // de click, evita timeouts en runners fríos.
  const boardToggle = page.getByLabel(/vista de tablero/i);
  await expect(boardToggle).toBeEnabled({ timeout: TIMEOUTS.long });
  await boardToggle.click();

  const pendingColumn = page.getByTestId("maintenance-kanban-column-pending");
  await expect(pendingColumn).toBeVisible({ timeout: TIMEOUTS.long });

  const seededCard = page.getByTestId(`maintenance-kanban-card-${seed.maintenance_log_id}`);
  await expect(seededCard).toBeVisible({ timeout: TIMEOUTS.medium });

  // La tarjeta sembrada debe estar DENTRO de la columna pending, no en otra.
  await expect(pendingColumn.getByTestId(`maintenance-kanban-card-${seed.maintenance_log_id}`)).toBeVisible();

  const opener = seededCard.getByRole("button", { name: /abrir orden de mantenimiento/i });
  await expect(seededCard.getByRole("button", { name: /mover orden de mantenimiento/i })).toBeVisible();
  await opener.focus();
  await opener.press("Enter");
  // El sheet de detalle usa role=dialog. No asertamos copy específico para no
  // acoplar al texto de la UI.
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: TIMEOUTS.short });
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});
