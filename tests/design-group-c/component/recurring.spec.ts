import { expect, test } from "@playwright/test";
import { closeOfflinePages } from "../../offlineTeardown";
import { evidenceRoot as evidence } from "../paths";
import { getComponentTransportLedgers, installComponentTransport } from "./transport";

test.afterEach(async ({ context }) => {
  const errors = await closeOfflinePages(context);
  for (const ledger of getComponentTransportLedgers(context)) {
    expect.soft(ledger.errors).toEqual([]);
    expect.soft(ledger.unexpected).toEqual([]);
    expect.soft(ledger.externalBlocked).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("recurring modal fits, uses one scroll area and keeps actions visible", async ({ context, page }, info) => {
  await installComponentTransport(context);
  await page.goto("/tests/design-group-c/component/index.html?view=recurring");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Generar borradores recurrentes" })).toBeVisible();
  await expect(dialog.getByText("Cliente facturado oculto")).toHaveCount(0);
  await expect(dialog.getByText("Cliente terminado oculto")).toHaveCount(0);
  await expect(dialog.getByText(/reserva terminada.*completa la devolución/i)).toHaveCount(0);
  await expect(dialog.getByText("Períodos disponibles:").locator("..")).toContainText("18");
  await expect(dialog.getByRole("region", { name: "Períodos que requieren revisión" })).toContainText("Historial de facturación");
  const scrollables = await dialog.evaluate(element => [element, ...element.querySelectorAll("*")]
    .filter(node => /(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1).length);
  expect(scrollables).toBe(1);
  await expect(async () => {
    for (const button of [dialog.getByRole("button", { name: "Cancelar", exact: true }), dialog.getByRole("button", { name: "Generar 0 periodos" })]) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
  }).toPass();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: `${evidence}/${info.project.name}-recurring-initial.png`, animations: "disabled" });
});

test("future consent is explicit and resets on disable and close", async ({ context, page }, info) => {
  await installComponentTransport(context);
  await page.goto("/tests/design-group-c/component/index.html?view=recurring");
  const optIn = page.getByRole("checkbox", { name: "Incluir períodos futuros" });
  const future = page.getByRole("checkbox", { name: /Incluir la reserva QA-FUTURE/ });
  await expect(optIn).not.toBeChecked();
  await optIn.check();
  await expect(future).not.toBeChecked();
  await future.check();
  await expect(page.getByRole("button", { name: "Generar 1 periodo", exact: true })).toBeEnabled();
  await page.screenshot({ path: `${evidence}/${info.project.name}-recurring-future-selected.png`, animations: "disabled" });
  await optIn.uncheck();
  await optIn.check();
  await expect(future).not.toBeChecked();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Abrir recurrentes" }).click();
  await expect(optIn).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Generar 0 periodos" })).toBeDisabled();
  await optIn.check();
  await future.check();
  await page.getByRole("button", { name: "Generar 1 periodo", exact: true }).click();
  await expect(page.getByLabel("Confirmación ficticia")).toContainText('"includeFuturePeriods":true');
  await expect(page.getByLabel("Confirmación ficticia")).toContainText('"bookingId":"future"');
});

test("a future month requires its earlier pending period and loses consent when it is unchecked", async ({ context, page }, info) => {
  await installComponentTransport(context);
  await page.goto("/tests/design-group-c/component/index.html?view=recurring");
  await page.getByRole("checkbox", { name: "Incluir períodos futuros" }).check();
  const previous = page.getByRole("checkbox", { name: "Incluir la reserva QA-0 del periodo Noviembre 2026", exact: true });
  const next = page.getByRole("checkbox", { name: /Incluir la reserva QA-CONTIGUOUS/ });
  await expect(next).toBeDisabled();
  await expect(page.getByText("Selecciona primero los períodos pendientes anteriores de esta reserva.")).toBeVisible();
  await previous.check();
  await next.check();
  await expect(page.getByRole("button", { name: "Generar 2 periodos", exact: true })).toBeEnabled();
  await page.screenshot({ path: `${evidence}/${info.project.name}-recurring-consecutive-selected.png`, animations: "disabled" });
  await previous.uncheck();
  await expect(next).not.toBeChecked();
  await expect(next).toBeDisabled();
  await previous.check();
  await expect(next).not.toBeChecked();
});
