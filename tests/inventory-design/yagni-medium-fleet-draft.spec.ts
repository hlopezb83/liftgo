import assert from "node:assert/strict";
import { expect, test } from "@playwright/test";
import { forkliftId, installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

test("Flota conserva captura y candado tras refetch y sólo recarga al confirmar", async ({ page, context, baseURL }, info) => {
  const origin = new URL(baseURL!).origin;
  const transport = await installGroupCTransport(context, origin);
  const originalVersion = "2026-01-01T00:00:00Z", remoteVersion = "2026-02-01T00:00:00Z";
  let remote = false;
  const writes: Array<Record<string, unknown>> = [];
  const row = { id: forkliftId, name: "QA Equipo de sesión", manufacturer: "QA Fabricante", model: "Modelo QA", equipment_model_id: "00000000-0000-4000-8000-000000000041",
    status: "available", serial_number: "QA-001", fuel_type: "Diesel", daily_rate: 500, weekly_rate: 3000, monthly_rate: 10000,
    notes: "Nota inicial", updated_at: originalVersion, created_at: originalVersion, deleted_at: null };
  const headers = { "access-control-allow-origin": origin, "access-control-allow-headers": "*", "access-control-allow-methods": "GET, PATCH, OPTIONS" };
  await context.route("http://127.0.0.1:54321/rest/v1/forklifts*", route => {
    const request = route.request(), url = new URL(request.url());
    const json = (value: unknown) => route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(value) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() === "PATCH") {
      assert.equal(url.searchParams.get("id"), `eq.${forkliftId}`);
      const body = request.postDataJSON();
      writes.push({ ...body, expectedVersion: url.searchParams.get("updated_at") });
      if (url.searchParams.get("updated_at") !== `eq.${remoteVersion}`) return json([]);
      Object.assign(row, body);
      return json({ ...row, updated_at: remoteVersion });
    }
    if (request.method() !== "GET") return route.fallback();
    const current = remote ? { ...row, notes: "Nota remota", daily_rate: 900, updated_at: remoteVersion } : row;
    return json(request.headers().accept?.includes("vnd.pgrst.object") ? current : [current]);
  });
  await page.goto(`/fleet/${forkliftId}`);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const notes = page.getByRole("textbox", { name: "Notas", exact: true });
  await expect(notes).toHaveValue("Nota inicial");
  await notes.fill("Mi captura pendiente");
  remote = true;
  await page.clock.install();
  await page.clock.fastForward(61_000);
  await Promise.all([
    page.waitForResponse(response => response.request().method() === "GET" && response.url().includes(`/forklifts?`) && response.url().includes("id=eq.")),
    page.evaluate(() => { window.dispatchEvent(new Event("offline")); window.dispatchEvent(new Event("online")); }),
  ]);
  await page.clock.resume();
  await expect(page.getByText(/El equipo cambió en el servidor/)).toBeVisible();
  await expect(notes).toHaveValue("Mi captura pendiente");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByText(/otro usuario modificó este montacargas/).first()).toBeVisible();
  expect(writes[0]).toMatchObject({ notes: "Mi captura pendiente", expectedVersion: `eq.${originalVersion}` });
  await expect(notes).toHaveValue("Mi captura pendiente");
  const notifications = page.getByRole("region", { name: "Notificaciones alt+T", exact: true })
    .getByRole("button", { name: "Cerrar notificación", exact: true });
  for (let count = await notifications.count(); count > 0; count = await notifications.count()) {
    await notifications.first().click();
    await expect(notifications).toHaveCount(count - 1);
  }

  const reload = page.getByRole("button", { name: "Recargar datos", exact: true });
  await reload.evaluate(button => button.scrollIntoView({ block: "center" }));
  await reload.click();
  const dialog = page.getByRole("alertdialog", { name: "¿Recargar los datos del equipo?", exact: true });
  await dialog.getByRole("button", { name: "Seguir editando", exact: true }).click();
  await expect(notes).toHaveValue("Mi captura pendiente");
  await reload.evaluate(button => button.scrollIntoView({ block: "center" }));
  await reload.click();
  await dialog.getByRole("button", { name: "Recargar y descartar", exact: true }).click();
  await expect(notes).toHaveValue("Nota remota");
  await expect(page.getByRole("spinbutton", { name: "Tarifa Diaria ($)", exact: true })).toHaveValue("900");
  // FormActions releases its existing duplicate-submit guard 400 ms after busy.
  await page.clock.runFor(450);
  await notes.fill("Captura sobre la versión actual");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/fleet/${forkliftId}$`));
  await expect(page.getByRole("alertdialog", { name: "¿Descartar cambios?", exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(2);
  expect(writes[1]).toMatchObject({ notes: "Captura sobre la versión actual", expectedVersion: `eq.${remoteVersion}` });
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-medium-fleet-session.png`, fullPage: true });
  expect(await closeOfflinePages(context)).toEqual([]);
  expect(transport.unexpected).toEqual([]);
  expect(transport.pageErrors).toEqual([]);
  const allowed = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
  expect(transport.externalBlocked.filter(request => !allowed.has(request))).toEqual([]);
});
