import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  installQuoteTransport, customerName, modelLabel, detailDescription,
  quoteMxnId, quoteUsdId, quoteAcceptedId, type QuoteTransportOptions,
} from "./fixtures";

const evidenceDir = "../quote-evidence";
mkdirSync(evidenceDir, { recursive: true });
const test = base.extend<{
  transportOptions: QuoteTransportOptions;
  transport: Awaited<ReturnType<typeof installQuoteTransport>>;
}>({
  transportOptions: [{}, { option: true }],
  transport: [async ({ context, baseURL, transportOptions }, use, testInfo) => {
    const result = await installQuoteTransport(context, new URL(baseURL!).origin, transportOptions);
    const pageErrors: string[] = [];
    context.on("page", (page) => page.on("pageerror", (error) => pageErrors.push(error.message)));
    await use(result);
    const name = `${testInfo.project.name}-${testInfo.title.replace(/\W+/g, "-")}`;
    writeFileSync(`${evidenceDir}/${name}-network.json`, JSON.stringify({ ...result, pageErrors }, null, 2));
    expect(result.unexpected, "No unexpected network or server-function request").toEqual([]);
    expect(result.blockedWrites, "No application write was even attempted").toEqual([]);
    expect(pageErrors, "No real build page error").toEqual([]);
  }, { auto: true }],
});

const money = (value: number, currency: string) => new Intl.NumberFormat("es-MX", {
  style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);
const footer = (page: Page) => page.getByRole("region", { name: "Total y acciones de cotización", exact: true });
const card = (page: Page, title: string) => page.getByRole("heading", { name: title, exact: true }).locator("..").locator("..");

async function capture(page: Page, name: string, target?: Locator) {
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidenceDir}/${test.info().project.name}-${name}.png`, animations: "disabled" });
}

async function assertNoOverflow(page: Page, name: string) {
  const geometry = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    widths: [document.documentElement, document.body, document.querySelector("#main-content")]
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .map((element) => ({ tag: element.id || element.tagName, scroll: element.scrollWidth, client: element.clientWidth })),
  }));
  writeFileSync(`${evidenceDir}/${test.info().project.name}-${name}-geometry.json`, JSON.stringify(geometry, null, 2));
  for (const width of geometry.widths) expect(width.scroll, `${name}: ${width.tag} horizontal overflow`).toBeLessThanOrEqual(width.client + 1);
}

async function assertFooterVisible(page: Page, total?: number, currency = "MXN") {
  const region = footer(page);
  await expect(region).toBeVisible();
  await expect(region.getByRole("button", { name: /^(Crear|Actualizar) cotización$/ })).toHaveCount(1);
  await expect(page.locator('button[type="submit"]')).toHaveCount(1);
  const rect = await region.boundingBox();
  expect(rect, "Footer has visible geometry").not.toBeNull();
  expect(rect!.y, "Footer is below the application header").toBeGreaterThanOrEqual(47);
  expect(rect!.y + rect!.height, "Footer stays completely within the viewport").toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  if (total !== undefined) await expect(region).toContainText(money(total, currency));
}

async function assertDesktopSummary(page: Page, content: Locator) {
  if (test.info().project.name !== "desktop-1440") return;
  const summary = page.getByRole("complementary", { name: /Resumen/ }).first();
  await expect(summary).toBeVisible();
  const [mainBox, summaryBox] = await Promise.all([content.boundingBox(), summary.boundingBox()]);
  expect(mainBox).not.toBeNull(); expect(summaryBox).not.toBeNull();
  expect(summaryBox!.x, "Desktop summary occupies a separate right column").toBeGreaterThanOrEqual(mainBox!.x + mainBox!.width - 1);
  expect(summaryBox!.width, "Desktop summary has readable width").toBeGreaterThanOrEqual(280);
}

async function selectCurrency(page: Page, currency: "MXN" | "USD") {
  await card(page, "Detalles de Cotización").getByRole("combobox").first().click();
  await page.getByRole("option", { name: new RegExp(`^${currency} \\(`) }).click();
}

async function chooseCustomer(page: Page) {
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: new RegExp(customerName) }).click();
}

async function chooseModel(page: Page, kind: "renta" | "venta") {
  const row = page.getByRole("group", { name: `Equipo de ${kind} 1`, exact: true });
  await row.getByRole("combobox", { name: "Modelo *", exact: true }).click();
  await page.getByRole("option", { name: modelLabel, exact: true }).click();
  await expect(row.locator("p").filter({ hasText: modelLabel })).toHaveText(modelLabel);
  await expect(row.getByRole("combobox")).toHaveAccessibleDescription(modelLabel);
  return row;
}

async function checkNotesAndKeyboard(page: Page, name: string, total: number, currency: string) {
  const notes = page.getByPlaceholder(/^Estas notas aparecerán en la cotización que recibe el cliente/);
  await notes.fill("QA Notas ficticias largas para comprobar que el total y la acción permanecen accesibles durante la edición sin guardar.");
  await assertFooterVisible(page, total, currency);
  await capture(page, `${name}-notes`);
  if (test.info().project.name.startsWith("mobile")) {
    const original = page.viewportSize()!;
    // Reduced visual area approximates a keyboard; no claim of a native OS IME.
    await page.setViewportSize({ width: original.width, height: 430 });
    await notes.click();
    await expect(notes).toBeFocused();
    const [inputBox, footerBox] = await Promise.all([notes.boundingBox(), footer(page).boundingBox()]);
    expect(inputBox).not.toBeNull(); expect(footerBox).not.toBeNull();
    expect(inputBox!.y, "Focused notes are below sticky application header").toBeGreaterThanOrEqual(48);
    expect(inputBox!.y + inputBox!.height, "Focused notes are not covered by the action bar").toBeLessThanOrEqual(footerBox!.y + 1);
    await assertFooterVisible(page, total, currency);
    await assertNoOverflow(page, `${name}-keyboard-430`);
    await capture(page, `${name}-keyboard-430`);
    await page.setViewportSize(original);
  }
  await assertNoOverflow(page, name);
}

test("rental capture MXN and USD, persistent single action", async ({ page }) => {
  await page.goto("/quotes/new");
  await expect(page.getByRole("heading", { name: "Nueva cotización", exact: true })).toBeVisible();
  await assertFooterVisible(page, 0);
  await capture(page, "rental-initial");
  await chooseCustomer(page);
  await page.getByRole("textbox", { name: /Periodo de Renta.*inicio/ }).fill("01/11/2026");
  await page.getByRole("textbox", { name: /Periodo de Renta.*fin/ }).fill("30/11/2026");
  await page.keyboard.press("Tab");
  const row = await chooseModel(page, "renta");
  await row.getByRole("spinbutton", { name: "Cantidad", exact: true }).fill("2");
  await expect(row.getByRole("spinbutton", { name: "Tarifa Diaria (MXN)", exact: true })).toHaveValue("1000");
  await expect(row.getByRole("spinbutton", { name: "Tarifa Semanal (MXN)", exact: true })).toHaveValue("5000");
  await expect(row.getByRole("spinbutton", { name: "Tarifa Mensual (MXN)", exact: true })).toHaveValue("15000");
  await assertFooterVisible(page, 34800);
  await capture(page, "rental-mxn-equipment", row);
  await assertDesktopSummary(page, card(page, "Equipos a Cotizar"));
  await selectCurrency(page, "USD");
  await expect(row.getByRole("spinbutton", { name: "Tarifa Mensual (USD)", exact: true })).toHaveValue("15000");
  await expect(row).toContainText(money(30000, "USD"));
  await assertFooterVisible(page, 34800, "USD");
  await capture(page, "rental-usd-equipment", row);
  await checkNotesAndKeyboard(page, "rental-usd", 34800, "USD");
});

test("sale capture MXN and USD, model identity and net amount", async ({ page }) => {
  await page.goto("/quotes/new");
  await expect(page.getByRole("heading", { name: "Nueva cotización", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Venta", exact: true }).click();
  await assertFooterVisible(page, 0);
  await capture(page, "sale-initial");
  await chooseCustomer(page);
  const row = await chooseModel(page, "venta");
  await expect(row.getByRole("spinbutton", { name: "Precio Unit. (MXN)", exact: true })).toHaveValue("");
  await row.getByRole("spinbutton", { name: "Cantidad", exact: true }).fill("2");
  await row.getByRole("spinbutton", { name: "Precio Unit. (MXN)", exact: true }).fill("125000");
  await row.getByRole("spinbutton", { name: "Descuento", exact: true }).fill("10");
  await expect(row).toContainText(money(225000, "MXN"));
  await assertFooterVisible(page, 261000);
  await capture(page, "sale-mxn-equipment", row);
  await assertDesktopSummary(page, card(page, "Equipos a Cotizar"));
  if (test.info().project.name === "desktop-1440") {
    await page.setViewportSize({ width: 1024, height: 800 });
    await assertFooterVisible(page, 261000);
    await assertNoOverflow(page, "sale-tablet-1024");
    await capture(page, "sale-tablet-1024", row);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await selectCurrency(page, "USD");
  await expect(row.getByRole("spinbutton", { name: "Precio Unit. (USD)", exact: true })).toHaveValue("125000");
  await expect(row.getByRole("spinbutton", { name: "Descuento", exact: true })).toHaveValue("10");
  await expect(row).toContainText(money(225000, "USD"));
  await assertFooterVisible(page, 261000, "USD");
  await capture(page, "sale-usd-equipment", row);
  await checkNotesAndKeyboard(page, "sale-usd", 261000, "USD");
});

for (const currency of ["MXN", "USD"] as const) {
  test(`detail ${currency}, multiple long lines and both discounts`, async ({ page }) => {
    const quoteId = currency === "USD" ? quoteUsdId : quoteMxnId;
    await page.goto(`/quotes/${quoteId}`);
    await expect(page.getByRole("heading", { name: `QA-COT-${currency}`, exact: true })).toBeVisible();
    const lines = test.info().project.name.startsWith("mobile")
      ? page.getByTestId("line-items-mobile") : page.getByRole("table");
    await expect(lines.getByText(detailDescription, { exact: true })).toBeVisible();
    await expect(lines).toContainText(money(15000, currency));
    await expect(lines).toContainText(money(27000, currency));
    await expect(lines).toContainText(`-${money(250, currency)}`);
    await expect(lines).toContainText("-10%");
    if (currency === "USD") await expect(lines.getByText(money(15000, "MXN"), { exact: true })).toHaveCount(0);
    await capture(page, `detail-${currency.toLowerCase()}-top`);
    await capture(page, `detail-${currency.toLowerCase()}-lines`, lines.getByText(detailDescription, { exact: true }));
    await assertDesktopSummary(page, lines);
    const subtotal = page.getByText("Subtotal", { exact: true });
    await subtotal.scrollIntoViewIfNeeded();
    const summary = subtotal.locator("..");
    await expect(summary).toContainText(money(31000, currency));
    await expect(summary).toContainText(money(4960, currency));
    await expect(summary).toContainText(money(35960, currency));
    await capture(page, `detail-${currency.toLowerCase()}-summary`);
    await assertNoOverflow(page, `detail-${currency.toLowerCase()}`);
  });
}

test("accepted quote retains locked amounts and no submit", async ({ page }) => {
  await page.goto(`/quotes/${quoteAcceptedId}/edit`);
  await expect(page.getByRole("heading", { name: "Editar cotización", exact: true })).toBeVisible();
  await expect(page.getByText(/Esta cotización ya fue aceptada o convertida a reserva/)).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toHaveCount(0);
  await expect(footer(page)).toContainText("USD");
  await capture(page, "accepted-locked");
  await assertNoOverflow(page, "accepted-locked");
});

test("cancel and back preserve the unsaved changes guard", async ({ page }) => {
  await page.goto(`/quotes/${quoteMxnId}`);
  await expect(page.getByRole("heading", { name: "QA-COT-MXN", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Editar cotización", exact: true })).toBeVisible();
  await page.getByPlaceholder(/^Estas notas aparecerán en la cotización que recibe el cliente/).fill("QA cambio local sin guardar");
  await footer(page).getByRole("button", { name: "Cancelar", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "¿Descartar cambios?", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Seguir editando", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Editar cotización", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(dialog).toBeVisible();
  await capture(page, "back-unsaved-guard");
  await dialog.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "QA-COT-MXN", exact: true })).toBeVisible();
  await assertNoOverflow(page, "return-after-discard");
});

test.describe("read permission fixture", () => {
  test.use({ transportOptions: { readOnly: true } });
  test("detail keeps readable amounts without edit or status mutations", async ({ page }) => {
    await page.goto(`/quotes/${quoteUsdId}`);
    await expect(page.getByRole("heading", { name: "QA-COT-USD", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Marcar Enviada", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Eliminar", exact: true })).toHaveCount(0);
    await expect(page.getByText(detailDescription, { exact: true }).filter({ visible: true })).toBeVisible();
    await capture(page, "read-permission-detail");
    await assertNoOverflow(page, "read-permission-detail");
  });
});
