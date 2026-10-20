import { expect } from "@playwright/test";
import { test, fitsViewport, noHorizontalOverflow } from "./mobileTest";

const lists = [
  {
    path: "/bookings",
    title: "Reservas",
    table: "bookings",
    card: "Reserva QA-RES-001",
  },
  {
    path: "/deliveries",
    title: "Entregas",
    table: "deliveries",
    card: "Ver entrega QA-ENT-001",
  },
  {
    path: "/returns",
    title: "Devoluciones",
    table: "return_inspections",
    card: "Ver devolución QA-DEV-001",
  },
];

for (const list of lists) {
  test(`${list.title}: tarjeta ficticia no vacía y controles caben`, async ({
    page,
    mockBackend,
  }, info) => {
    await page.goto(list.path);
    const card = page.getByRole("link", { name: list.card, exact: true });
    await fitsViewport(page, card);
    await noHorizontalOverflow(page);
    // Keyboard-operable actual link, not an inert clickable DIV.
    await card.focus();
    await expect(card).toBeFocused();
    await expect(card).toHaveAttribute(
      "href",
      /^\/(bookings|deliveries|returns)\//,
    );
    await page.screenshot({
      path: info.outputPath(`${list.table}.png`),
      fullPage: true,
    });
    expect(mockBackend.observed.has(list.table)).toBe(true);
  });
}

test("menú lateral: abrir, excluir finanzas, navegar y cerrar", async ({
  page,
}, info) => {
  await page.goto("/bookings");
  await expect(
    page.getByRole("link", { name: "Reserva QA-RES-001", exact: true }),
  ).toBeVisible();
  const trigger = page.getByRole("button", {
    name: "Alternar barra lateral",
    exact: true,
  });
  await trigger.tap();
  const menu = page.getByRole("dialog", {
    name: "Menú principal",
    exact: true,
  });
  await fitsViewport(page, menu);
  await expect(
    menu.getByRole("link", { name: /Facturas|Gastos|Usuarios|Configuración/ }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("mobile-menu.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.tap();
  await menu.getByRole("link", { name: "Entregas", exact: true }).tap();
  await expect(page).toHaveURL(/\/deliveries$/);
  await expect(menu).toBeHidden();
  await expect(
    page.getByRole("link", { name: "Ver entrega QA-ENT-001", exact: true }),
  ).toBeVisible();
  await noHorizontalOverflow(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/bookings$/);
  await expect(
    page.getByRole("link", { name: "Reserva QA-RES-001", exact: true }),
  ).toBeVisible();
  await expect(menu).toBeHidden();
  await page.goForward();
  await expect(page).toHaveURL(/\/deliveries$/);
  await expect(
    page.getByRole("link", { name: "Ver entrega QA-ENT-001", exact: true }),
  ).toBeVisible();
  await expect(menu).toBeHidden();
});

test("búsqueda: teclado, diálogo reducido y navegación permitida", async ({
  page,
}, info) => {
  await page.goto("/bookings");
  const trigger = page.getByRole("button", {
    name: "Navegación rápida",
    exact: true,
  });
  await trigger.tap();
  const dialog = page.getByRole("dialog", {
    name: "Navegación rápida",
    exact: true,
  });
  const input = dialog.getByRole("combobox");
  await expect(input).toBeFocused();
  await fitsViewport(page, dialog, true);
  await input.fill("facturas");
  await expect(
    dialog.getByRole("option", { name: "Facturas", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  // Reduced viewport is a resize stress test, NOT a real software keyboard.
  await page.setViewportSize({
    width: page.viewportSize()!.width,
    height: 480,
  });
  await trigger.tap();
  await input.fill("Entregas");
  const option = dialog.getByRole("option", { name: "Entregas", exact: true });
  await expect(option).toBeVisible();
  await fitsViewport(page, dialog, true);
  await fitsViewport(page, input);
  await page.screenshot({
    path: info.outputPath("quick-navigation-480h.png"),
    fullPage: true,
  });
  await input.press("Enter");
  await expect(page).toHaveURL(/\/deliveries$/);
  await expect(dialog).toBeHidden();
});

test("filtros: sheet accesible con foco contenido y restaurado", async ({
  page,
}, info) => {
  await page.goto("/bookings");
  await expect(
    page.getByRole("link", { name: "Reserva QA-RES-001", exact: true }),
  ).toBeVisible();
  const trigger = page.getByRole("button", { name: "Filtros", exact: true });
  await trigger.tap();
  const dialog = page.getByRole("dialog", { name: "Filtros", exact: true });
  await fitsViewport(page, dialog, true);
  await expect(
    dialog.getByRole("combobox", { name: "Filtrar por estado" }),
  ).toBeVisible();
  for (let n = 0; n < 6; n++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((e) => e.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.screenshot({
    path: info.outputPath("filters.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.tap();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await noHorizontalOverflow(page);
});
