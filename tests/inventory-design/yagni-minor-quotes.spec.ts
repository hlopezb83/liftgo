import { expect, test } from "@playwright/test";
import { installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

test("cambiar Renta/Venta conserva la captura al cancelar y limpia sólo al confirmar", async ({ page, context, baseURL }, info) => {
  const transport = await installGroupCTransport(context, new URL(baseURL!).origin);
  const quoteWrites: string[] = [];
  context.on("request", request => {
    if (!["GET", "OPTIONS"].includes(request.method()) && new URL(request.url()).pathname === "/rest/v1/quotes") {
      quoteWrites.push(request.method());
    }
  });
  // A small synthetic catalogue keeps the real form and model-selection path.
  await context.route("http://127.0.0.1:54321/rest/v1/equipment_models*", route => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([{ id: "00000000-0000-4000-8000-000000000041", organization_id: "00000000-0000-4000-8000-000000000002",
        manufacturer: "QA", model: "Modelo de prueba", is_active: true,
        default_daily_rate: 500, default_weekly_rate: 3000, default_monthly_rate: 12000 }]) });
  });

  await page.goto("/quotes/new");
  const rental = page.getByRole("group", { name: "Equipo de renta 1", exact: true });
  await rental.getByRole("combobox", { name: "Modelo *", exact: true }).click();
  await page.getByRole("option", { name: "QA — Modelo de prueba", exact: true }).click();
  await rental.getByRole("spinbutton", { name: "Cantidad", exact: true }).fill("2");
  await rental.getByRole("spinbutton", { name: "Tarifa Diaria (MXN)", exact: true }).fill("650");
  await page.getByRole("button", { name: "Agregar modelo", exact: true }).click();
  const secondRental = page.getByRole("group", { name: "Equipo de renta 2", exact: true });
  await secondRental.getByRole("spinbutton", { name: "Cantidad", exact: true }).fill("3");
  const logistics = page.getByRole("checkbox", { name: "Incluir Servicio de Logística", exact: true });
  await logistics.check();
  const logisticsAmount = page.getByText("Monto del Servicio", { exact: true }).locator("..").getByRole("spinbutton");
  await logisticsAmount.fill("900");
  const notes = page.getByPlaceholder("Estas notas aparecerán en la cotización que recibe el cliente…");
  await notes.fill("Nota local que debe conservarse");

  await page.getByRole("tab", { name: "Venta", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "¿Cambiar el tipo de cotización?", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Seguir editando", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Renta", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(rental.getByRole("combobox", { name: "Modelo *", exact: true })).toContainText("Modelo de prueba");
  await expect(rental.getByRole("spinbutton", { name: "Cantidad", exact: true })).toHaveValue("2");
  await expect(rental.getByRole("spinbutton", { name: "Tarifa Diaria (MXN)", exact: true })).toHaveValue("650");
  await expect(secondRental.getByRole("spinbutton", { name: "Cantidad", exact: true })).toHaveValue("3");
  await expect(logistics).toBeChecked();
  await expect(logisticsAmount).toHaveValue("900");
  await expect(notes).toHaveValue("Nota local que debe conservarse");

  await page.getByRole("tab", { name: "Venta", exact: true }).click();
  await dialog.getByRole("button", { name: "Cambiar y limpiar partidas", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const sale = page.getByRole("group", { name: "Equipo de venta 1", exact: true });
  await expect(sale.getByRole("combobox", { name: "Modelo *", exact: true })).toContainText("Seleccionar modelo");
  await expect(sale.getByRole("spinbutton", { name: "Cantidad", exact: true })).toHaveValue("1");
  await expect(sale.getByRole("spinbutton", { name: "Precio Unit. (MXN)", exact: true })).toHaveValue("");
  await expect(page.getByRole("group", { name: /^Equipo de renta/ })).toHaveCount(0);
  await expect(logistics).not.toBeChecked();
  await expect(notes).toHaveValue("Nota local que debe conservarse");

  // Notes alone are retained, so returning to an empty rental needs no dialog.
  await page.getByRole("tab", { name: "Renta", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rental.getByRole("combobox", { name: "Modelo *", exact: true })).toContainText("Seleccionar modelo");
  await expect(rental.getByRole("spinbutton", { name: "Cantidad", exact: true })).toHaveValue("1");
  await expect(rental.getByRole("spinbutton", { name: "Tarifa Diaria (MXN)", exact: true })).toHaveValue("");
  await expect(secondRental).toHaveCount(0);
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-minor-quote-type.png`, fullPage: true });

  expect(await closeOfflinePages(context)).toEqual([]);
  expect(quoteWrites).toEqual([]);
  expect(transport.unexpected).toEqual([]);
  expect(transport.pageErrors).toEqual([]);
  const knownBlocked = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
  expect(transport.externalBlocked.filter(request => !knownBlocked.has(request))).toEqual([]);
});
