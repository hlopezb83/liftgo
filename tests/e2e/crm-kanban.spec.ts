import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/crmSeed";

/** Cede dos frames para que dnd-kit recalcule colisiones entre teclas. */
async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * E2E del Kanban de CRM con movimiento optimista (dnd-kit).
 *
 * El drag por pointer de dnd-kit depende de coordenadas por frame y es
 * inestable en headless; usamos el KeyboardSensor (ya configurado en
 * `CRMKanbanGrid`), que es determinista: Space toma la tarjeta, ArrowRight la
 * mueve a la columna siguiente y Space la suelta.
 *
 * Lo que valida:
 *  1. La tarjeta sembrada aparece en la columna "nuevo_prospecto".
 *  2. Tras el drag, la tarjeta queda en "contactado" de inmediato (optimista).
 *  3. Tras recargar, el cambio persistió en la base de datos.
 */
// Viewport ancho: con pantallas angostas las columnas del Kanban quedan fuera
// de vista y el sensor de teclado prioriza el scroll horizontal.
test.use({ viewport: { width: 1600, height: 900 } });

test("mover una tarjeta de CRM entre columnas es optimista y persiste", async ({ page, crm }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/crm", { waitUntil: "domcontentloaded" });

  const origin = page.getByTestId("crm-kanban-column-nuevo_prospecto");
  const target = page.getByTestId("crm-kanban-column-contactado");
  const card = page.getByTestId(`crm-kanban-card-${crm.prospectId}`);

  await expect(origin).toBeVisible({ timeout: 20_000 });
  await expect(target).toBeVisible({ timeout: 20_000 });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(origin.getByTestId(`crm-kanban-card-${crm.prospectId}`)).toBeVisible();

  // Drag con teclado: foco -> tomar -> mover a la derecha -> soltar.
  // Damos un frame entre teclas para que dnd-kit recalcule colisiones.
  await card.focus();
  await page.keyboard.press("Space");
  await nextFrame(page);
  await page.keyboard.press("ArrowRight");
  await nextFrame(page);
  const persisted = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      /\/rest\/v1\/prospects(?:\?|$)/.test(response.url()),
    { timeout: 20_000 },
  );
  await page.keyboard.press("Space");

  // Optimista: la tarjeta debe aparecer en la columna destino sin esperar red.
  await expect(target.getByTestId(`crm-kanban-card-${crm.prospectId}`)).toBeVisible({
    timeout: 5_000,
  });
  await expect(origin.getByTestId(`crm-kanban-card-${crm.prospectId}`)).toHaveCount(0);

  // No recargamos mientras el PATCH sigue en vuelo: hacerlo podía abortar la
  // petición y dejar únicamente el cambio optimista en memoria.
  expect((await persisted).ok()).toBe(true);

  // Persistencia: tras recargar sigue en "contactado" (sin rollback).
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(target.getByTestId(`crm-kanban-card-${crm.prospectId}`)).toBeVisible({
    timeout: 20_000,
  });

  expect(errors, `errores de página: ${errors.join(" | ")}`).toEqual([]);
});

test("abrir la tarjeta muestra el panel de detalle del prospecto", async ({ page, crm }) => {
  await page.goto("/crm", { waitUntil: "domcontentloaded" });

  const card = page.getByTestId(`crm-kanban-card-${crm.prospectId}`);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByText(crm.companyName)).toBeVisible();
});
