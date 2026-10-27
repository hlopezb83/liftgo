import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { billNumber, customerId, customerName, equipmentName, forkliftId, installGroupCTransport, invoiceId, invoiceNumber } from "./fixtures";
import { evidenceRoot as evidence } from "./paths";
mkdirSync(evidence, { recursive: true });
const test = base.extend<{ transport: Awaited<ReturnType<typeof installGroupCTransport>> }>({
  transport: [async ({ context, baseURL }, use, info) => {
    const transport = await installGroupCTransport(context, new URL(baseURL!).origin);
    await use(transport);
    await context.unrouteAll({ behavior: "wait" });
    writeFileSync(`${evidence}/${info.project.name}-${info.title.replace(/\W+/g, "-")}-network.json`, JSON.stringify(transport, null, 2));
    expect(transport.unexpected).toEqual([]); expect(transport.pageErrors).toEqual([]);
  }, { auto: true }],
});
async function shot(page: Page, name: string, target?: Locator) {
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidence}/${test.info().project.name}-${name}.png`, animations: "disabled" });
}
async function activateListControl(target: Locator) {
  if (test.info().project.use.hasTouch) await target.tap();
  else await target.click();
}
async function waitForDialogLayout(dialog: Locator) {
  await dialog.evaluate(async element => {
    const finite = element.getAnimations().filter(animation => animation.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.all(finite.map(animation => animation.finished.catch(() => undefined)));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}
async function geometry(page: Page, name: string, scope = "#main-content") {
  const metrics = await page.evaluate(selector => {
    const root = document.querySelector(selector) ?? document.body;
    return { viewport: { width: innerWidth, height: innerHeight }, widths: [document.documentElement, document.body, root].map(e => ({ tag: e.id || e.tagName, scroll: e.scrollWidth, client: e.clientWidth })), controls: [...root.querySelectorAll("button,input,textarea")].filter(e => (e as HTMLElement).offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return { text: e.textContent?.trim().slice(0, 80), tag: e.tagName, x: r.x, y: r.y, width: r.width, height: r.height }; }) };
  }, scope);
  writeFileSync(`${evidence}/${test.info().project.name}-${name}-geometry.json`, JSON.stringify(metrics, null, 2));
  expect(metrics.widths.filter(width => width.scroll > width.client + 1), `${name}: horizontal overflow`).toEqual([]);
}
async function assertFocusedFieldUncovered(page: Page, field: Locator, name: string) {
  await expect(field).toBeFocused();
  await field.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  const metrics = await field.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const blockers = [...document.querySelectorAll('[data-app-header], [role="region"][aria-label="Acciones del equipo"], [role="dialog"] [class*="sticky"]')]
      .filter(candidate => !candidate.contains(element))
      .filter(candidate => ["sticky", "fixed"].includes(getComputedStyle(candidate).position))
      .map(candidate => ({ candidate, box: candidate.getBoundingClientRect() }))
      .filter(({ box }) => Math.min(rect.right, box.right) - Math.max(rect.left, box.left) > 1 && Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top) > 1)
      .map(({ candidate, box }) => ({ label: candidate.getAttribute("aria-label") ?? candidate.tagName, top: box.top, bottom: box.bottom }));
    const clippedBy: string[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (!["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(parent).overflowY)) continue;
      const box = parent.getBoundingClientRect();
      if (rect.top < box.top - 1 || rect.bottom > box.bottom + 1) clippedBy.push(parent.id || parent.getAttribute("role") || parent.tagName);
    }
    return { field: element.getAttribute("name"), focused: document.activeElement === element, bounds: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }, viewport: { width: innerWidth, height: innerHeight }, blockers, clippedBy };
  });
  // Snapshot the browser's own focus scroll before any scrollIntoView helper.
  await shot(page, `${name}-focus`);
  writeFileSync(`${evidence}/${test.info().project.name}-${name}-focus.json`, JSON.stringify(metrics, null, 2));
  expect(metrics.focused).toBe(true);
  expect(metrics.bounds.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.bounds.right).toBeLessThanOrEqual(metrics.viewport.width + 1);
  expect(metrics.bounds.top).toBeGreaterThanOrEqual(-1);
  expect(metrics.bounds.bottom).toBeLessThanOrEqual(metrics.viewport.height + 1);
  expect(metrics.blockers, `${name}: sticky header/footer covers focused field`).toEqual([]);
  expect(metrics.clippedBy, `${name}: scrollport clips focused field`).toEqual([]);
}

test("customer detail contact invoices and bookings", async ({ page }) => {
  await page.goto(`/customers/${customerId}`);
  await expect(page.getByRole("heading", { name: customerName, exact: true })).toBeVisible();
  await shot(page, "customer-detail-contact");
  await shot(page, "customer-detail-bookings", page.getByText("Historial de Reservas", { exact: true }));
  await shot(page, "customer-detail-invoices", page.getByText("FAC-2026-OPERACION-INDUSTRIAL-00000012340", { exact: true }));
  await expect(page.getByText(/1,234,567,890\.12/).first()).toBeVisible();
  await geometry(page, "customer-detail");
});

test("customer invoice keyboard activation returns to the exact customer origin", async ({ page, baseURL }) => {
  const origin = `/customers/${customerId}?qa=keyboard-origin#historial-facturas`;
  await page.goto(origin);
  await expect(page.getByRole("heading", { name: customerName, exact: true })).toBeVisible();
  await expect(page).toHaveURL(new URL(origin, baseURL).href);
  const invoice = page.getByRole("button", { name: new RegExp(invoiceNumber) });
  await invoice.focus();
  await expect(invoice).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new URL(`/invoices/${invoiceId}`, baseURL).href);
  await expect(page.getByRole("heading", { name: invoiceNumber, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(page).toHaveURL(new URL(origin, baseURL).href);
  await expect(page.getByRole("heading", { name: customerName, exact: true })).toBeVisible();
  await geometry(page, "customer-invoice-keyboard-return");
  await shot(page, "customer-invoice-keyboard-return");
  writeFileSync(`${evidence}/${test.info().project.name}-customer-invoice-keyboard-return.json`, JSON.stringify({ origin, invoice: `/invoices/${invoiceId}`, returned: origin }, null, 2));
});

for (const invoicesAccess of ["read", "none"] as const) {
  test(`customer keeps access with invoices ${invoicesAccess} and prevents invoice navigation`, async ({ context, baseURL, page }) => {
    const transport = await installGroupCTransport(context, new URL(baseURL!).origin, { role: "ventas", invoicesAccess });
    const origin = `/customers/${customerId}?qa=access-${invoicesAccess}#contacto`;
    await page.goto(origin);
    await expect(page.getByRole("heading", { name: customerName, exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Contacto", exact: true })).toBeVisible();
    const main = page.locator("#main-content");
    await expect(main.getByText("Facturas", { exact: true })).toHaveCount(invoicesAccess === "read" ? 1 : 0);
    await expect(page.getByRole("button", { name: new RegExp(invoiceNumber) })).toHaveCount(0);
    await expect(main.locator('a[href^="/invoices/"]')).toHaveCount(0);
    const folio = main.getByText(invoiceNumber, { exact: true });
    await expect(folio).toHaveCount(invoicesAccess === "read" ? 1 : 0);
    await expect(main.locator('[role="button"], [tabindex="0"]').filter({ hasText: invoiceNumber })).toHaveCount(0);
    if (invoicesAccess === "read") await folio.click();
    await expect(page).toHaveURL(new URL(origin, baseURL).href);
    await expect(page.getByRole("heading", { name: customerName, exact: true })).toBeVisible();
    await geometry(page, `customer-invoices-${invoicesAccess}`);
    await shot(page, `customer-invoices-${invoicesAccess}`);
    expect(transport.observed).not.toContain("GET invoices");
    expect(transport.unexpected).toEqual([]);
    expect(transport.pageErrors).toEqual([]);
    writeFileSync(`${evidence}/${test.info().project.name}-customer-invoices-${invoicesAccess}-network.json`, JSON.stringify(transport, null, 2));
  });
}

test("customer new dialog errors dirty escape and cancel", async ({ page }) => {
  await page.goto("/customers?new=1");
  const dialog = page.getByRole("dialog", { name: "Nuevo cliente", exact: true });
  await expect(dialog).toBeVisible();
  await shot(page, "customer-new-top");
  await dialog.getByRole("button", { name: "Agregar cliente", exact: true }).click();
  await expect(dialog.getByLabel(/Nombre/).first()).toHaveAttribute("aria-invalid", "true");
  await shot(page, "customer-new-validation");
  await dialog.getByLabel(/Nombre/).first().fill(customerName);
  await shot(page, "customer-new-fiscal", dialog.getByText("Datos Fiscales (CFDI)", { exact: true }).first());
  const regimen = dialog.getByRole("combobox", { name: "Régimen Fiscal", exact: true });
  await regimen.click();
  await page.getByRole("option", { name: /^622\b/ }).click();
  const uso = dialog.getByRole("combobox", { name: "Uso CFDI", exact: true });
  await uso.click();
  await page.getByRole("option", { name: /^G03\b/ }).click();
  await expect(regimen).toContainText("Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras");
  await expect(uso).toContainText("Gastos en general");
  await expect(uso).toBeFocused();
  await assertFocusedFieldUncovered(page, uso, "customer-fiscal-selected");
  await shot(page, "customer-new-fiscal-selected");
  await geometry(page, "customer-new-fiscal-selected", '[role="dialog"]');
  const finalField = dialog.locator("textarea").last();
  await dialog.getByLabel("Dirección", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await assertFocusedFieldUncovered(page, finalField, "customer-new-last-field");
  await finalField.fill("QA notas ficticias del último campo");
  await shot(page, "customer-new-last-field");
  await geometry(page, "customer-new", '[role="dialog"]');
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Seguir editando" }).click();
  await expect(dialog.getByLabel(/Nombre/).first()).toHaveValue(customerName);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(dialog).toBeHidden();
});

test("fleet edit sticky actions and last field", async ({ page }) => {
  await page.goto(`/fleet/${forkliftId}/edit`);
  await expect(page.getByRole("heading", { name: "Editar montacargas", exact: true })).toBeVisible();
  await expect(page.getByLabel(/Nombre \/ ID/)).toHaveValue(equipmentName);
  await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toBeInViewport();
  await shot(page, "fleet-edit-top");
  await shot(page, "fleet-edit-rates", page.getByText("Tarifas y Costos", { exact: true }).first());
  const notes = page.getByRole("textbox", { name: "Notas", exact: true });
  await page.getByRole("spinbutton", { name: /Costo de Póliza/ }).focus();
  await page.keyboard.press("Tab");
  await assertFocusedFieldUncovered(page, notes, "fleet-edit-notes");
  await shot(page, "fleet-edit-notes");
  await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toHaveCount(1);
  await geometry(page, "fleet-edit");
  await page.setViewportSize({ width: test.info().project.use.viewport?.width ?? 390, height: 420 });
  await page.getByRole("spinbutton", { name: /Costo de Póliza/ }).focus();
  await page.keyboard.press("Tab");
  await assertFocusedFieldUncovered(page, notes, "fleet-edit-height-420");
  await shot(page, "fleet-edit-height-420");
  await geometry(page, "fleet-edit-height-420");
});

test("fleet new actions and required errors without mutation", async ({ page }) => {
  await page.goto("/fleet/new");
  await expect(page.getByRole("heading", { name: "Agregar montacargas", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar montacargas", exact: true })).toBeInViewport();
  await shot(page, "fleet-new-top");
  await page.getByRole("button", { name: "Agregar montacargas", exact: true }).click();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
  await shot(page, "fleet-new-validation");
  await geometry(page, "fleet-new");
});

test("fleet cancel and back restore destinations from real list history", async ({ page, baseURL }) => {
  const listOrigin = "/fleet?status=available#qa-list-origin";
  await page.goto(listOrigin);
  await expect(page.getByRole("heading", { name: "Equipos", exact: true })).toBeVisible();
  await expect(page.getByText(equipmentName, { exact: true }).first()).toBeVisible();
  await expect(page).toHaveURL(new URL(listOrigin, baseURL).href);
  const destinations: Array<{ action: string; from: string; to: string }> = [];
  for (const action of ["Cancelar", "Volver"]) {
    const createButton = page.getByRole("button", { name: /^(Nuevo equipo|Agregar montacargas)$/ }).filter({ visible: true }).first();
    await expect(createButton).toBeEnabled();
    await createButton.focus();
    await expect(createButton).toBeFocused();
    await activateListControl(createButton);
    await expect(page).toHaveURL(new URL("/fleet/new", baseURL).href);
    await expect(page.getByRole("heading", { name: "Agregar montacargas", exact: true })).toBeVisible();
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(page).toHaveURL(new URL(listOrigin, baseURL).href);
    await expect(page.getByRole("heading", { name: "Equipos", exact: true })).toBeVisible();
    destinations.push({ action, from: "/fleet/new", to: listOrigin });
  }
  await activateListControl(page.getByText(equipmentName, { exact: true }).first());
  const detailOrigin = `/fleet/${forkliftId}`;
  await expect(page).toHaveURL(new URL(detailOrigin, baseURL).href);
  await expect(page.getByRole("heading", { name: equipmentName, exact: true })).toBeVisible();
  for (const action of ["Cancelar", "Volver"]) {
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await expect(page).toHaveURL(new URL(`/fleet/${forkliftId}/edit`, baseURL).href);
    await expect(page.getByRole("heading", { name: "Editar montacargas", exact: true })).toBeVisible();
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(page).toHaveURL(new URL(detailOrigin, baseURL).href);
    await expect(page.getByRole("heading", { name: equipmentName, exact: true })).toBeVisible();
    destinations.push({ action, from: `${detailOrigin}/edit`, to: detailOrigin });
  }
  await geometry(page, "fleet-cancel-back-history");
  await shot(page, "fleet-cancel-back-history");
  writeFileSync(`${evidence}/${test.info().project.name}-fleet-cancel-back-history.json`, JSON.stringify(destinations, null, 2));
});

test("supplier sheet context persistent actions and payment", async ({ page }) => {
  await page.goto("/cuentas-por-pagar");
  await page.getByText(billNumber, { exact: true }).first().click();
  const sheet = page.getByRole("dialog").first();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Registrar pago/ })).toBeInViewport();
  await shot(page, "supplier-sheet-top");
  await shot(page, "supplier-sheet-history", sheet.getByText(/Pagos aplicados/));
  await expect(sheet.getByRole("button", { name: /Registrar pago/ })).toBeInViewport();
  await geometry(page, "supplier-sheet", '[role="dialog"]');
  await sheet.getByRole("button", { name: /Registrar pago/ }).click();
  const dialog = page.getByRole("dialog", { name: /Registrar pago/ });
  await dialog.getByLabel(/Monto/).blur();
  await expect(dialog.getByLabel(/Monto/)).toHaveValue("1,234,567,890.12");
  await expect(dialog.getByLabel(/Monto/).locator("..").getByText("USD", { exact: true })).toBeVisible();
  await shot(page, "supplier-payment-usd");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(sheet.getByRole("button", { name: /Registrar pago/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  const activeElement = await page.evaluate(() => ({ tag: document.activeElement?.tagName, role: document.activeElement?.getAttribute("role"), text: document.activeElement?.textContent?.trim().slice(0, 120) }));
  writeFileSync(`${evidence}/${test.info().project.name}-supplier-sheet-close-focus.json`, JSON.stringify(activeElement, null, 2));
});

test("supplier capture total footer and notes", async ({ page }) => {
  await page.goto("/cuentas-por-pagar");
  await page.getByRole("button", { name: /Nueva factura/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nueva factura de proveedor", exact: true });
  await expect(dialog).toBeVisible();
  await shot(page, "supplier-new-top");
  await dialog.getByLabel(/Subtotal/).fill("1234567.89");
  await dialog.getByLabel(/Subtotal/).blur();
  const notes = dialog.getByLabel("Notas", { exact: true });
  if (await notes.count()) { await notes.focus(); await shot(page, "supplier-new-last-field", notes); }
  await shot(page, "supplier-new-total", dialog.getByRole("button", { name: "Registrar", exact: true }));
  await geometry(page, "supplier-new", '[role="dialog"]');
  await page.setViewportSize({ width: test.info().project.use.viewport?.width ?? 390, height: 420 });
  await waitForDialogLayout(dialog);
  const lastInput = dialog.locator("input").last();
  await lastInput.focus();
  await assertFocusedFieldUncovered(page, lastInput, "supplier-new-height-420");
  await shot(page, "supplier-new-height-420");
  await geometry(page, "supplier-new-height-420", '[role="dialog"]');
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(dialog).toBeHidden();
});

for (const profile of [
  { role: "admin", invoicesAccess: "full", costs: true, financials: true },
  { role: "dispatcher", invoicesAccess: "none", costs: false, financials: true },
  { role: "mechanic", invoicesAccess: "full", costs: true, financials: false },
] as const) {
  test(`fleet detail ${profile.role} separate costs and financials`, async ({ context, baseURL, page }) => {
    const transport = await installGroupCTransport(context, new URL(baseURL!).origin, profile);
    await page.goto(`/fleet/${forkliftId}`);
    await expect(page.getByRole("heading", { name: equipmentName, exact: true })).toBeVisible();
    await expect(page.getByText("Especificaciones", { exact: true })).toBeVisible();
    await expect(page.getByText("Tarifas de Renta", { exact: true })).toHaveCount(profile.costs ? 1 : 0);
    await expect(page.getByText("Resumen Financiero", { exact: true })).toHaveCount(profile.financials ? 1 : 0);
    await shot(page, `fleet-detail-${profile.role}`);
    await shot(page, `fleet-insurance-${profile.role}`, page.getByText("Seguro", { exact: true }));
    const insurance = page.locator("details").first();
    await expect(insurance).toHaveAttribute("open", "");
    await insurance.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(insurance).not.toHaveAttribute("open", "");
    await page.keyboard.press("Enter");
    await expect(insurance).toHaveAttribute("open", "");
    await geometry(page, `fleet-detail-${profile.role}`);
    expect(transport.unexpected).toEqual([]);
    writeFileSync(`${evidence}/${test.info().project.name}-fleet-role-${profile.role}-network.json`, JSON.stringify(transport, null, 2));
  });
}

test("supplier query error retry fits reduced height", async ({ context, baseURL, page }) => {
  const transport = await installGroupCTransport(context, new URL(baseURL!).origin, { billError: true });
  await page.setViewportSize({ width: test.info().project.use.viewport?.width ?? 390, height: 420 });
  await page.goto("/cuentas-por-pagar");
  await page.getByText(billNumber, { exact: true }).first().click();
  const sheet = page.getByRole("dialog").first();
  await expect(sheet.getByText("No se pudo cargar el detalle de la factura de proveedor", { exact: true })).toBeVisible();
  const retry = sheet.getByRole("button", { name: "Reintentar", exact: true });
  await retry.scrollIntoViewIfNeeded();
  await expect(retry).toBeInViewport();
  await shot(page, "supplier-sheet-query-error-height-420");
  await geometry(page, "supplier-sheet-query-error-height-420", '[role="dialog"]');
  expect(transport.unexpected).toEqual([]);
});
