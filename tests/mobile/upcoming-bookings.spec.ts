import { expect } from "@playwright/test";
import { test, fitsViewport, noHorizontalOverflow } from "./mobileTest";

test.use({ profile: "booking-list" });

test("upcoming view is named, visible, server-filtered and ordered by start date", async ({ page }) => {
  await page.goto("/bookings");
  const selector = page.getByRole("button", { name: "Próximas reservas", exact: true });
  await fitsViewport(page, selector);
  await expect(page.getByRole("link", { name: /^Reserva QA-RES-/ })).toHaveCount(5);
  await selector.click();
  await expect(page).toHaveURL(/view=upcoming/);
  await expect(selector).toHaveAttribute("aria-pressed", "true");
  const cards = page.getByRole("link", { name: /^Reserva QA-RES-/ });
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("QA-RES-102");
  await expect(cards.nth(1)).toContainText("QA-RES-103");
  await expect(page.getByRole("list", { name: "Filtros activos" })).toContainText("Vista: Próximas reservas");
  await page.getByRole("button", { name: "Todas las reservas", exact: true }).click();
  await expect(page).not.toHaveURL(/view=upcoming/);
  await expect(cards).toHaveCount(5);
  await noHorizontalOverflow(page);
});

test("upcoming URL keeps the selected status and filters it before the limit", async ({ page }) => {
  await page.goto("/bookings?status=confirmed");
  await page.getByRole("button", { name: "Próximas reservas", exact: true }).click();
  await expect(page).toHaveURL(/status=confirmed&view=upcoming/);
  const cards = page.getByRole("link", { name: /^Reserva QA-RES-/ });
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1)).toContainText("QA-RES-103");
  await expect(page.getByRole("list", { name: "Filtros activos" })).toContainText("Estado: Confirmado");
  await page.reload();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1)).toContainText("QA-RES-103");
  await expect(page.getByRole("button", { name: "Próximas reservas", exact: true })).toHaveAttribute("aria-pressed", "true");
});
