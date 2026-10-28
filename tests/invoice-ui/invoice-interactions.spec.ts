import { expect } from "@playwright/test";
import { fitsViewport, noHorizontalOverflow, test } from "../mobile/mobileTest";
import { addConcept, description, net, openNew, price, quantity, selectCustomer, tabTo } from "./invoiceTest";

test.use({ profile: "invoice" });
test.skip(process.env.INVOICE_CAPTURE_PHASE === "before", "La captura baseline precede a las mejoras de UI");

test("tarjetas y controles caben; resumen lateral en escritorio y acciones sticky en móvil", async ({ page }, info) => {
  await openNew(page);
  await addConcept(page, 1, "Concepto ficticio de varias palabras para verificar ajuste de texto sin desplazamiento horizontal", "2.5", "100");
  const section = page.getByRole("region", { name: "Partidas", exact: true });
  await noHorizontalOverflow(page);
  for (const control of [description(page), quantity(page), price(page), page.getByRole("combobox", { name: "Clave SAT partida 1", exact: true }), page.getByRole("combobox", { name: "Unidad SAT partida 1", exact: true })]) {
    await fitsViewport(page, control);
  }
  const overflowing = await section.evaluate((element) =>
    [...element.querySelectorAll<HTMLElement>("div,fieldset,ul,li")]
      .filter((child) => child.clientWidth > 0 && child.scrollWidth > child.clientWidth + 1)
      .map((child) => ({ tag: child.tagName, scroll: child.scrollWidth, client: child.clientWidth })),
  );
  expect(overflowing, "no inner horizontal scrolling in concepts").toEqual([]);
  const summary = page.getByRole("complementary", { name: "Resumen de importes", exact: true });
  if (info.project.name === "desktop") {
    const [conceptBox, summaryBox] = await Promise.all([section.boundingBox(), summary.boundingBox()]);
    expect(conceptBox).not.toBeNull();
    expect(summaryBox).not.toBeNull();
    expect(summaryBox!.x).toBeGreaterThanOrEqual(conceptBox!.x + conceptBox!.width - 1);
  } else {
    await description(page).scrollIntoViewIfNeeded();
    await fitsViewport(page, page.getByRole("button", { name: "Cancelar", exact: true }), true);
    await fitsViewport(page, page.getByRole("button", { name: "Crear factura", exact: true }), true);
    await page.screenshot({ path: info.outputPath("after-sticky-actions.png") });
  }
});

test("Tab y Shift+Tab recorren el concepto; SAT muestra código y nombre y Escape restaura foco", async ({ page }) => {
  await openNew(page);
  await addConcept(page, 1, "Concepto ficticio operable con teclado", "2", "100");
  await description(page).click();
  await page.keyboard.press("Tab");
  await expect(quantity(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(price(page)).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(quantity(page)).toBeFocused();
  const product = page.getByRole("combobox", { name: "Clave SAT partida 1", exact: true });
  const currentProduct = page.getByRole("option", { name: "78181500 - Alquiler de equipo de manejo de materiales", exact: true });
  const nextProduct = page.getByRole("option", { name: "78181501 - Alquiler de montacargas", exact: true });
  await tabTo(page, product);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(currentProduct).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(product).toBeFocused();
  await expect(product).toContainText("78181500 - Alquiler de equipo de manejo de materiales");
  await page.keyboard.press("Enter");
  // Radix positions the menu and moves keyboard focus asynchronously.
  // Observe that focus before sending the next real keyboard action.
  await expect(currentProduct).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(nextProduct).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(product).toContainText("78181501 - Alquiler de montacargas");
  const unit = page.getByRole("combobox", { name: "Unidad SAT partida 1", exact: true });
  await tabTo(page, unit);
  await page.keyboard.press("Enter");
  const currentUnit = page.getByRole("option", { name: "DAY - Día", exact: true });
  const serviceUnit = page.getByRole("option", { name: "E48 - Unidad de servicio", exact: true });
  // New concepts start with DAY; Radix focuses the selected option on open.
  await expect(currentUnit).toBeFocused();
  await expect(currentUnit).toHaveAttribute("data-state", "checked");
  await page.keyboard.press("Home");
  await expect(serviceUnit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(unit).toContainText("E48 - Unidad de servicio");
  await expect(unit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(serviceUnit).toBeFocused();
  await expect(serviceUnit).toHaveAttribute("data-state", "checked");
  await page.keyboard.press("Escape");
  await expect(unit).toBeFocused();
  await expect(net(page)).toHaveText(/200\.00/);
});

test("cantidad, precio, IVA, moneda y eliminación recalculan importes sin persistencia", async ({ page }) => {
  await openNew(page);
  await selectCustomer(page);
  await addConcept(page, 1, "Concepto de prueba de importes", "2", "1250");
  await addConcept(page, 2, "Segundo concepto ficticio", "1", "500");
  const summary = page.getByRole("complementary", { name: "Resumen de importes", exact: true });
  await expect(summary).toContainText("3,480.00");
  await quantity(page).fill("3");
  await price(page).fill("1000");
  await expect(net(page)).toHaveText(/3,000\.00/);
  await expect(summary).toContainText("4,060.00");
  await summary.getByRole("combobox").click();
  await page.getByRole("option", { name: "0% (Tasa cero)", exact: true }).click();
  await expect(summary).toContainText("3,500.00");
  await page.getByRole("combobox", { name: "Moneda", exact: true }).click();
  await page.getByRole("option", { name: "USD - Dólar Americano", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Tipo de Cambio", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Eliminar partida", exact: true }).nth(1).click();
  await expect(description(page, 2)).toHaveCount(0);
  await expect(summary).toContainText("3,000.00");
  await noHorizontalOverflow(page);
});

test("validación inválida no envía factura y deja corregir el concepto", async ({ page }) => {
  await openNew(page);
  await page.getByRole("button", { name: "Agregar Fila", exact: true }).click();
  await page.getByRole("button", { name: "Crear factura", exact: true }).click();
  await expect(page.getByText("El cliente es requerido", { exact: true })).toBeVisible();
  await expect(page.getByText("Descripción requerida", { exact: true })).toBeVisible();
  await expect(page.getByText("El total de la factura debe ser mayor a $0", { exact: true })).toBeVisible();
  await description(page).fill("Concepto ficticio corregible");
  await expect(description(page)).toHaveValue("Concepto ficticio corregible");
  await expect(page.getByRole("heading", { name: "Nueva factura", exact: true })).toBeVisible();
});

test("Cancelar y Volver protegen cambios; seguir editando o descartar funciona con teclado", async ({ page }) => {
  await openNew(page, true);
  await addConcept(page, 1, "Cambios ficticios sin guardar", "2", "100");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "¿Descartar cambios?", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Seguir editando", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(description(page)).toHaveValue("Cambios ficticios sin guardar");
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Descartar", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/invoices$/);
  await expect(page.getByRole("heading", { name: "Facturas", exact: true })).toBeVisible();
});

test("interrumpir el cierre nativo conserva los cambios sin guardar", async ({ page }) => {
  await openNew(page);
  await addConcept(page, 1, "Cambios ficticios conservados al interrumpir cierre", "1", "100");
  const pendingDialog = page.waitForEvent("dialog", { timeout: 10000 });
  // runBeforeUnload triggers the real native guard without waiting for a
  // navigation that the user deliberately cancels by dismissing the dialog.
  await page.close({ runBeforeUnload: true });
  const dialog = await pendingDialog;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  expect(page.isClosed()).toBe(false);
  await expect(description(page)).toHaveValue("Cambios ficticios conservados al interrumpir cierre");
  await expect(page.getByRole("heading", { name: "Nueva factura", exact: true })).toBeVisible();
});

test("resize escritorio y móvil conserva un solo concepto, valores SAT y foco", async ({ page }) => {
  await openNew(page);
  await addConcept(page, 1, "Concepto ficticio conservado al cambiar ancho", "2.5", "1250.50");
  const product = page.getByRole("combobox", { name: "Clave SAT partida 1", exact: true });
  await product.click();
  await page.getByRole("option", { name: "78181501 - Alquiler de montacargas", exact: true }).click();
  await description(page).click();
  const originalPrice = await price(page).inputValue();
  const original = await description(page).elementHandle();
  if (!original) throw new Error("Missing mounted description control");
  for (const width of [1440, 360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(description(page)).toHaveCount(1);
    await expect(quantity(page)).toHaveCount(1);
    await expect(price(page)).toHaveCount(1);
    await expect(product).toHaveCount(1);
    expect(await description(page).evaluate((element, previous) => element === previous, original)).toBe(true);
    await expect(description(page)).toBeFocused();
    await expect(description(page)).toHaveValue("Concepto ficticio conservado al cambiar ancho");
    await expect(quantity(page)).toHaveValue("2.5");
    await expect(price(page)).toHaveValue(originalPrice);
    await expect(product).toContainText("78181501 - Alquiler de montacargas");
    await noHorizontalOverflow(page);
  }
  await original.dispose();
});
