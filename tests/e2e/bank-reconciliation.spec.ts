import { TIMEOUTS, expectNoToastError } from "./fixtures/helpers";
import { test, expect, type BankSeedIds } from "./fixtures/bankSeed";
import type { Page } from "@playwright/test";

/**
 * E2E del módulo de Conciliación Bancaria (v7.247.0).
 *
 * Los movimientos se crean en una cuenta bancaria temporal y el fixture
 * `bank` los borra al terminar cada test, pase o falle.
 */

test.use({ viewport: { width: 1600, height: 900 } });

/** Abre la página y selecciona la cuenta temporal del escenario. */
async function openReconciliation(page: Page, bank: BankSeedIds): Promise<void> {
  await page.goto("/conciliacion-bancaria", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /conciliación bancaria/i })).toBeVisible({
    timeout: TIMEOUTS.long,
  });
  const accountSelect = page.getByTestId("bank-account-select");
  await expect(accountSelect).toBeVisible({ timeout: TIMEOUTS.long });
  await accountSelect.click();

  const option = page.getByRole("option", { name: new RegExp(bank.scope) });
  // La lista de cuentas se cachea 60s; si el arranque frío de CI la sirvió sin
  // la cuenta recién sembrada, recargamos una vez y reabrimos el selector.
  if (!(await option.isVisible().catch(() => false))) {
    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(accountSelect).toBeVisible({ timeout: TIMEOUTS.long });
    await accountSelect.click();
  }
  await expect(option).toBeVisible({ timeout: TIMEOUTS.long });
  await option.click();
  await expect(page.getByTestId("bank-workspace")).toBeVisible({ timeout: TIMEOUTS.long });
  await expect(page.getByText(bank.orphanRef)).toBeVisible({ timeout: TIMEOUTS.long });
}


function row(page: Page, reference: string) {
  return page.locator("tbody tr").filter({ hasText: reference });
}

test.describe("Conciliación bancaria", () => {
  // Cada test siembra datos vía API, hace login y navega: 30s es justo en CI frío.
  test.describe.configure({ timeout: 60_000 });

  test("KPIs reflejan los movimientos sembrados", async ({ page, bank }) => {
    await openReconciliation(page, bank);

    await expect(page.getByTestId("bank-kpi-charges")).toContainText("1,850.50");
    // Abonos = línea huérfana (987,654.32) + línea con candidato exacto.
    const expectedCredits = new Intl.NumberFormat("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(987654.32 + bank.exactAmount);
    await expect(page.getByTestId("bank-kpi-credits")).toContainText(expectedCredits);
    await expect(page.getByTestId("bank-kpi-reconciled")).toContainText("0% (0/3)");
    await expect(page.getByTestId("bank-kpi-reconciled")).toContainText("3 pendientes");
    await expectNoToastError(page);
  });

  test("pestañas de estado y búsqueda filtran las líneas", async ({ page, bank }) => {
    await openReconciliation(page, bank);

    // Pestaña "Conciliado" no debe mostrar nada del escenario.
    await page.getByRole("tab", { name: "Conciliado" }).click();
    await expect(page.getByText(bank.orphanRef)).toHaveCount(0);

    await page.getByRole("tab", { name: "Todas" }).click();
    await expect(row(page, bank.orphanRef)).toBeVisible();

    // Búsqueda por referencia.
    const search = page.getByPlaceholder(/descripción, referencia o monto/i);
    await search.fill(bank.chargeRef);
    await expect(row(page, bank.chargeRef)).toBeVisible();
    await expect(page.getByText(bank.orphanRef)).toHaveCount(0);

    // Búsqueda por monto.
    await search.fill("987654.32");
    await expect(row(page, bank.orphanRef)).toBeVisible();
    await expectNoToastError(page);
  });

  test("la selección marca el checkbox y activa la barra masiva", async ({ page, bank }) => {
    await openReconciliation(page, bank);

    const checkbox = row(page, bank.orphanRef).getByRole("checkbox");
    await checkbox.click();

    // Regresión v7.246.1: el checkbox debe pintarse, no solo contar.
    await expect(checkbox).toBeChecked();
    await expect(page.getByTestId("bank-bulk-count")).toHaveText("1 seleccionados");

    await page.getByRole("button", { name: "Limpiar" }).click();
    await expect(page.getByTestId("bank-bulk-toolbar")).toHaveCount(0);
    await expectNoToastError(page);
  });

  test("el panel muestra candidatos y permite emparejar por monto exacto", async ({
    page,
    bank,
  }) => {
    await openReconciliation(page, bank);

    await row(page, bank.exactRef).click();
    const panel = page.getByTestId("bank-match-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(bank.exactRef);

    const candidate = page.getByTestId("bank-candidate").first();
    // Si la BD demo no tiene un pago con ese monto/fecha, no hay nada que emparejar.
    const hasCandidate = await candidate
      .waitFor({ state: "visible", timeout: TIMEOUTS.medium })
      .then(() => true)
      .catch(() => false);
    // eslint-disable-next-line playwright/no-skipped-test -- Depende de que la BD demo tenga un pago con ese monto/fecha.
    test.skip(!hasCandidate, "Sin pagos reales que empaten con el monto sembrado");

    await expect(candidate).toContainText(/score/i);
    await expect(candidate).toContainText(/monto exacto|monto aproximado/i);

    await candidate.getByTestId("bank-candidate-match").click();
    await expect(row(page, bank.exactRef)).toHaveCount(0, { timeout: TIMEOUTS.medium });

    await page.getByRole("tab", { name: "Conciliado" }).click();
    await expect(row(page, bank.exactRef)).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(page.getByTestId("bank-kpi-reconciled")).toContainText("(1/3)");
    await expectNoToastError(page);
  });

  test("ignorar un cargo exige razón y lo mueve a Ignorado", async ({ page, bank }) => {
    await openReconciliation(page, bank);

    await row(page, bank.chargeRef).click();
    const panel = page.getByTestId("bank-match-panel");
    await expect(panel).toBeVisible();

    const submit = page.getByTestId("bank-panel-ignore-submit");
    await expect(submit).toBeDisabled();

    await page.getByTestId("bank-panel-ignore-reason").fill("Comisión bancaria (QA)");
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(row(page, bank.chargeRef)).toHaveCount(0, { timeout: TIMEOUTS.medium });
    await page.getByRole("tab", { name: "Ignorado" }).click();
    await expect(row(page, bank.chargeRef)).toBeVisible({ timeout: TIMEOUTS.medium });
    await expectNoToastError(page);
  });

  test("atajos J/K navegan entre movimientos y Escape cierra el panel", async ({ page, bank }) => {
    await openReconciliation(page, bank);

    await page.locator("body").click();
    await page.keyboard.press("j");
    await expect(page.getByTestId("bank-match-panel")).toBeVisible();

    await page.keyboard.press("j");
    await page.keyboard.press("k");
    await expect(page.getByTestId("bank-match-panel")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("bank-match-panel")).toHaveCount(0);
    await expectNoToastError(page);
  });

  test("snapshot visual del workspace", async ({ page, bank }) => {
    // eslint-disable-next-line playwright/no-skipped-test -- Baselines dependen del runner; gate E2E_VISUAL=1.
    test.skip(process.env.E2E_VISUAL !== "1", "Visual desactivado (activa con E2E_VISUAL=1)");
    await openReconciliation(page, bank);
    await row(page, bank.orphanRef).click();
    await expect(page.getByTestId("bank-match-panel")).toBeVisible();
    await page.evaluate(() => document.fonts?.ready);

    await expect(page.getByTestId("bank-workspace")).toHaveScreenshot(
      "bank-reconciliation-workspace.png",
      {
        animations: "disabled",
        maxDiffPixelRatio: 0.02,
        mask: [page.locator("time, [data-dynamic]"), page.locator(".animate-pulse")],
      },
    );
  });
});
