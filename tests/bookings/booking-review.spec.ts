import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { bookingId, customerName, forkliftName, installBookingTransport, modelName, type BookingScenario } from "./offlineFixtures";

const evidenceDir = process.env.BOOKINGS_EVIDENCE_DIR ?? "../booking-evidence";
const expectedSourceSha256: string = JSON.parse(readFileSync("dist/client/version.json", "utf8")).sourceSha256;
if (!/^[a-f0-9]{64}$/.test(expectedSourceSha256)) throw new Error("The built artifact requires a source identity");
mkdirSync(evidenceDir, { recursive: true });

const test = base.extend<{
  scenario: BookingScenario;
  transport: Awaited<ReturnType<typeof installBookingTransport>>;
}>({
  scenario: [{}, { option: true }],
  transport: [async ({ context, baseURL, scenario, page }, use, testInfo) => {
    if (!baseURL) throw new Error("Local baseURL required");
    const transport = await installBookingTransport(context, new URL(baseURL).origin, scenario);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
    await use(transport);
    // Drain local asset requests from the last navigation before Playwright
    // tears down the context. Keep the strict transport active throughout.
    await Promise.all(context.pages().map((page) => page.waitForLoadState("networkidle", { timeout: 10_000 })));
    writeFileSync(evidencePath(testInfo, "network.json"), JSON.stringify({ ...transport, errors }, null, 2));
    expect(transport.unexpected, "No unexpected reads or writes may escape the offline transport").toEqual([]);
    expect(errors, "The real application should have no uncaught browser errors").toEqual([]);
  }, { auto: true }],
});

function evidencePath(info: TestInfo, suffix: string) {
  const caseId = createHash("sha256").update(info.titlePath.join(" / ")).digest("hex").slice(0, 8);
  return join(evidenceDir, `${info.project.name}-${info.title.replace(/\W+/g, "-").slice(0, 65)}-${caseId}-${suffix}`);
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: evidencePath(test.info(), `${name}.png`), animations: "disabled" });
  const geometry = await page.evaluate(() => ({
    sourceSha256: (globalThis as typeof globalThis & { __LIFTGO_SOURCE_ID__?: string }).__LIFTGO_SOURCE_ID__,
    viewport: { width: innerWidth, height: innerHeight, visualHeight: visualViewport?.height },
    activeElement: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName,
    widths: [document.documentElement, document.body, document.getElementById("main-content"), document.querySelector('[role="dialog"]')].filter((node): node is HTMLElement => node instanceof HTMLElement).map((node) => ({ tag: node.id || node.tagName, scroll: node.scrollWidth, client: node.clientWidth, scrollTop: node.scrollTop })),
  }));
  writeFileSync(evidencePath(test.info(), `${name}-geometry.json`), JSON.stringify(geometry, null, 2));
  expect(geometry.sourceSha256, "The rendered bundle must match the built source identity").toBe(expectedSourceSha256);
  for (const width of geometry.widths) expect(width.scroll, `${width.tag} horizontal overflow`).toBeLessThanOrEqual(width.client);
}

async function openBooking(page: Page) {
  await page.goto(`/bookings/${bookingId}`);
  await expect(page.getByRole("heading", { name: "QA-RES-001", exact: true })).toBeVisible();
  return page.getByRole("region", { name: "Resumen de la reserva", exact: true });
}

test("booking overview keeps equipment period and state in the first viewport", async ({ page }) => {
  const summary = await openBooking(page);
  await expect(summary.getByText(forkliftName, { exact: true })).toBeVisible();
  await expect(summary.getByText(modelName, { exact: true })).toBeVisible();
  await expect(summary.getByText("Confirmado", { exact: true })).toBeVisible();
  await expect(summary.getByText("01/10/2026", { exact: true })).toBeVisible();
  await expect(summary.getByText("31/10/2026", { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(summary.getByText("31 días", { exact: true })).toBeVisible();
  await expect(summary).toBeInViewport({ ratio: 1 });
  await capture(page, "overview-top");
  await expect(page.getByText(customerName, { exact: true })).toBeVisible();
  await expect(page.getByText("QA Contacto administrativo ficticio", { exact: true })).toBeVisible();
  await expect(page.getByText("QA Contacto de obra ficticio", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Historial de la Reserva", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(page).toHaveURL(/\/bookings(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Reservas", exact: true })).toBeVisible();
});

for (const [status, label] of [["completed", "Completado"], ["cancelled", "Cancelado"]] as const) {
  test.describe(`terminal booking ${status}`, () => {
    test.use({ scenario: { status } });
    test("keeps the operational overview and hides extension", async ({ page }) => {
      const summary = await openBooking(page);
      await expect(summary.getByText(label, { exact: true })).toBeVisible();
      await expect(summary.getByText("31/10/2026", { exact: true })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("button", { name: "Extender", exact: true })).toHaveCount(0);
      await capture(page, `${status}-top`);
    });
  });
}

test.describe("read-only operational permission", () => {
  test.use({ scenario: { profile: "readonly" } });
  test("shows dates and contacts without financial or write controls", async ({ page }) => {
    const summary = await openBooking(page);
    await expect(summary.getByText(forkliftName, { exact: true })).toBeVisible();
    await expect(summary.getByText("31/10/2026", { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Extender", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Crear contrato", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Facturación", exact: true })).toHaveCount(0);
    await expect(page.getByRole("switch", { name: /facturación recurrente/i })).toHaveCount(0);
    await capture(page, "readonly-top");
    await page.getByRole("button", { name: "Más acciones", exact: true }).click();
    const cancel = page.getByRole("menuitem", { name: /Cancelar reserva/ });
    await expect(cancel).toHaveAttribute("aria-disabled", "true");
    await expect(cancel).toContainText(/solo puede consultar reservas/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Más acciones", exact: true })).toBeFocused();
  });
});

test.describe("full booking permission without financial access", () => {
  // Deliberately retain privileged stale prices and USD on the synthetic
  // booking/forklift rows. UI permissions must still withhold every amount.
  test.use({ scenario: { profile: "operational-full", currency: "USD" } });
  test("allows operational extension review without exposing stale financial data", async ({ page }) => {
    await openBooking(page);
    const trigger = page.getByRole("button", { name: "Extender", exact: true });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Extender Reserva", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Extender", exact: true })).toBeDisabled();
    await dialog.getByRole("textbox", { name: "Nueva Fecha de Fin", exact: true }).fill("07/11/2026");
    await page.keyboard.press("Tab");
    await expect(dialog.getByText("7 días adicionales", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Del 01/11/2026 al 07/11/2026, ambos incluidos.", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Extender", exact: true })).toBeEnabled();
    await expect(dialog.getByRole("region", { name: "Desglose estimado de la extensión" })).toHaveCount(0);
    await expect(dialog.getByText(/\bIVA\b|\bMXN\b|\bUSD\b|\btarifas?\b|subtotal|total adicional|\$|4[,.]500|5[,.]220|720[,.]00/i)).toHaveCount(0);
    await capture(page, "operational-full-extension-no-financial-data");
    // Keep the validated operational action untouched: this browser suite
    // never submits an extension or any other mutation.
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

for (const currency of ["MXN", "USD"] as const) {
  test.describe(`extension estimate ${currency}`, () => {
    test.use({ scenario: { currency } });
    test("explains seven days agreed rate VAT and estimate with complete dismissal paths", async ({ page }) => {
      await openBooking(page);
      const trigger = page.getByRole("button", { name: "Extender", exact: true });
      const dialog = page.getByRole("dialog", { name: "Extender Reserva", exact: true });
      await trigger.click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Extender", exact: true })).toBeDisabled();
      const date = dialog.getByRole("textbox", { name: "Nueva Fecha de Fin", exact: true });
      await date.fill("07/11/2026");
      await page.keyboard.press("Tab");
      await expect(dialog.getByText("7 días adicionales", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Del 01/11/2026 al 07/11/2026, ambos incluidos.", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Cálculo con tarifas pactadas", { exact: true })).toBeVisible();
      await expect(dialog.getByText("1 semana", { exact: true })).toBeVisible();
      const estimate = dialog.getByRole("region", { name: "Desglose estimado de la extensión" });
      // A section with an accessible name is exposed as a region.
      const appliedRate = estimate.getByText(/Tarifa aplicada:/);
      await expect(appliedRate).toContainText("4,500.00");
      await expect(appliedRate).toContainText(currency);
      await expect(estimate.getByText("IVA (16%)", { exact: true })).toBeVisible();
      const tax = estimate.getByText(/720\.00/);
      await expect(tax).toContainText(currency);
      const total = estimate.getByText(/5,220\.00/);
      await expect(total).toBeVisible();
      await expect(total).toContainText(currency);
      await expect(total).toBeInViewport({ ratio: 1 });
      await capture(page, `${currency}-estimate-initial-total`);
      await expect(estimate.getByText("Esta estimación no es una factura emitida.", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Extender", exact: true }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole("button", { name: "Cancelar", exact: true })).toBeInViewport({ ratio: 1 });
      await capture(page, `${currency}-estimate`);
      await tax.scrollIntoViewIfNeeded();
      await expect(tax).toBeInViewport({ ratio: 1 });
      await capture(page, `${currency}-estimate-breakdown`);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(dialog.getByText("Por seleccionar", { exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Extender", exact: true })).toBeDisabled();
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  });
}

test.describe("recurring extension estimate", () => {
  test.use({ scenario: { recurringBilling: true, currency: "MXN" } });
  test("explains monthly draft inclusion and identifies the estimated additional segment", async ({ page }) => {
    await openBooking(page);
    const trigger = page.getByRole("button", { name: "Extender", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Extender Reserva", exact: true });
    await dialog.getByRole("textbox", { name: "Nueva Fecha de Fin", exact: true }).fill("07/11/2026");
    await page.keyboard.press("Tab");
    await expect(dialog.getByText("Los días adicionales de esta reserva se incluyen al generar el borrador del periodo mensual correspondiente.", { exact: true })).toBeVisible();
    await expect(dialog.getByText("7 días adicionales", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Total estimado del tramo adicional", { exact: true })).toBeVisible();
    const total = dialog.getByText(/5,220\.00/);
    await expect(total).toContainText("MXN");
    await expect(dialog.getByText("Total adicional estimado", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Extender", exact: true }).scrollIntoViewIfNeeded();
    await capture(page, "recurring-additional-segment-estimate");
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test("desktop reflow at half viewport width simulates the space available at 200 percent zoom", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "The mobile projects already test 360/390px reflow directly.");
  // This is explicitly viewport reflow, not native browser zoom, OS text
  // scaling or pinch zoom. Halve both layout dimensions from 1440x1000.
  await page.setViewportSize({ width: 720, height: 500 });
  const summary = await openBooking(page);
  await expect(summary.getByText(forkliftName, { exact: true })).toBeVisible();
  await expect(summary.getByText(modelName, { exact: true })).toBeVisible();
  await expect(summary.getByText("31/10/2026", { exact: true })).toBeVisible();
  await capture(page, "simulated-200-percent-reflow-overview");
  const trigger = page.getByRole("button", { name: "Extender", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Extender Reserva", exact: true });
  await dialog.getByRole("textbox", { name: "Nueva Fecha de Fin", exact: true }).fill("07/11/2026");
  await page.keyboard.press("Tab");
  await expect(dialog.getByText(/5,220\.00/)).toBeVisible();
  await dialog.getByRole("button", { name: "Extender", exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("heading", { name: "Extender Reserva", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole("button", { name: "Cancelar", exact: true })).toBeInViewport({ ratio: 1 });
  await capture(page, "simulated-200-percent-reflow-extension-sticky");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

async function captureBookingForm(page: Page): Promise<Locator> {
  await page.goto("/bookings");
  await expect(page.getByRole("heading", { name: "Reservas", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Nueva reserva", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Nueva reserva", exact: true })).toBeVisible();
  const from = page.getByRole("textbox", { name: /^Fechas de reserva.*inicio$/ });
  const to = page.getByRole("textbox", { name: /^Fechas de reserva.*fin$/ });
  await expect(from).toBeEnabled();
  await from.fill("01/11/2026");
  await to.fill("30/11/2026");
  await page.keyboard.press("Tab");
  const equipment = page.getByRole("combobox", { name: "Montacargas", exact: true });
  await expect(equipment).toBeEnabled();
  await equipment.click();
  await page.getByRole("option", { name: new RegExp(forkliftName) }).click();
  await page.getByRole("combobox", { name: /^Cliente:/ }).click();
  await page.getByRole("option", { name: customerName, exact: true }).click();
  return page.getByRole("complementary", { name: "Revisar y crear reserva", exact: true });
}

test("new booking keeps one accessible action operational summary draft and keyboard space without submitting", async ({ page, transport }) => {
  const actions = await captureBookingForm(page);
  await expect(actions.getByText(forkliftName, { exact: true })).toBeVisible();
  await expect(actions.getByText(customerName, { exact: true })).toBeVisible();
  await expect(actions.getByText(/^01\/11\/2026\s*[-–]\s*30\/11\/2026/)).toBeVisible();
  await expect(actions.getByText("30 días de renta · fin incluido", { exact: true })).toBeVisible();
  await expect(actions.getByText(/subtotal|IVA|MXN|USD|total estimado/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Crear reserva", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Crear reserva", exact: true })).toBeEnabled();
  await page.getByRole("switch", { name: "Incluir en facturación mensual", exact: true }).check();
  await expect(actions.getByText("Incluida en facturación mensual", { exact: true })).toBeVisible();
  const main = page.locator("#main-content");
  await main.evaluate((node) => node.scrollTo({ top: 0, behavior: "instant" }));
  await expect(actions.getByRole("button", { name: "Crear reserva", exact: true })).toBeInViewport({ ratio: 1 });
  await capture(page, "new-booking-top-sticky");
  await main.evaluate((node) => node.scrollTo({ top: node.scrollHeight, behavior: "instant" }));
  await expect(actions.getByRole("button", { name: "Crear reserva", exact: true })).toBeInViewport({ ratio: 1 });
  await capture(page, "new-booking-bottom-sticky");

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Explicit viewport required");
  if (viewport.width < 1024) {
    // Focus is the keyboard guard even on mobile engines that keep the CSS
    // layout viewport unchanged when only the visual viewport shrinks.
    const contact = page.getByRole("textbox", { name: "Contacto", exact: true });
    await contact.focus();
    await expect(actions).toHaveCSS("position", "static");
    await capture(page, "new-booking-input-focused");
    await page.setViewportSize({ width: viewport.width, height: 420 });
    await contact.scrollIntoViewIfNeeded();
    await expect(contact).toBeInViewport({ ratio: 1 });
    await expect(actions).toHaveCSS("position", "static");
    await capture(page, "new-booking-short-keyboard");
    await page.keyboard.press("Tab");
    await page.setViewportSize(viewport);
  }
  expect(transport.observed).toContain("read RPC get_available_forklifts");
  await expect(page.getByRole("region", { name: "Borrador de reserva", exact: true }).getByText("Borrador guardado en este navegador", { exact: true })).toBeVisible();
  // Exercise the application's internal history and existing exit guard.
  // Never click the sole submit button or perform a backend mutation.
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  const exitGuard = page.getByRole("alertdialog");
  await expect(exitGuard).toBeVisible();
  await capture(page, "new-booking-cancel-guard");
  await exitGuard.getByRole("button", { name: "Seguir editando", exact: true }).click();
  await expect(exitGuard).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Nueva reserva", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(exitGuard).toBeVisible();
  await exitGuard.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page).toHaveURL(/\/bookings$/);
  await expect(page.getByRole("heading", { name: "Reservas", exact: true })).toBeVisible();
});
