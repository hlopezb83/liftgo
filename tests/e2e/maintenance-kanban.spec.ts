import { test, expect } from "./fixtures/seed";

/**
 * Smoke E2E del Kanban de Mantenimiento.
 *
 * El RPC `e2e_seed_scenario` siembra una orden de mantenimiento con
 * `work_status = 'pending'` vinculada al montacargas E2E. Este spec navega a
 * /maintenance y verifica que:
 *   1. La tarjeta aparece en la columna "pending" (selector por data-testid
 *      estable, no por texto en español).
 *   2. Al hacer click sobre la tarjeta se abre el panel lateral de detalle.
 *
 * No probamos el drag-and-drop entre columnas: react-beautiful-dnd /
 * @hello-pangea/dnd requiere coordenadas reales del pointer en cada frame y
 * suele ser inestable en Playwright headless. Para validar la transición de
 * estado conviene un test de hook (`useMaintenanceKanban`) ya cubierto en
 * Vitest.
 */
test("seeded maintenance work order appears in pending column", async ({ page, seed }) => {
  await page.goto("/maintenance", { waitUntil: "domcontentloaded" });

  // Vista por defecto es "list". Activamos el toggle "board" (Kanban) via su
  // aria-label estable; nunca por texto visible (que es solo un icono).
  await page.getByRole("button", { name: /vista de tablero/i }).click();

  const pendingColumn = page.getByTestId("maintenance-kanban-column-pending");
  await expect(pendingColumn).toBeVisible({ timeout: 15_000 });

  const seededCard = page.getByTestId(`maintenance-kanban-card-${seed.maintenance_log_id}`);
  await expect(seededCard).toBeVisible({ timeout: 10_000 });

  // La tarjeta sembrada debe estar DENTRO de la columna pending, no en otra.
  await expect(pendingColumn.getByTestId(`maintenance-kanban-card-${seed.maintenance_log_id}`)).toBeVisible();

  await seededCard.click();
  // El sheet de detalle usa role=dialog. No asertamos copy específico para no
  // acoplar al texto de la UI.
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
});
