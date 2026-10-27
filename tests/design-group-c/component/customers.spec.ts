import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { evidenceRoot as evidence } from "../paths";
import { installComponentTransport } from "./transport";

function assertImprovedWidths(geometry: { viewport: number; documentWidth: number; mainWidth: number; rows: Array<{ width: number; scrollWidth: number }> }) {
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.mainWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  for (const row of geometry.rows) expect(row.scrollWidth).toBeLessThanOrEqual(row.width + 1);
}
mkdirSync(evidence, { recursive: true });

test.afterEach(async ({ context }) => { await context.unrouteAll({ behavior: "wait" }); });

for (const state of ["before", "after"] as const) {
  test(`${state} customer detail long history`, async ({ context, page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    const transport = await installComponentTransport(context);
    await page.goto(`/tests/design-group-c/component/index.html?view=customer-detail&state=${state}`);
    await expect(page.getByRole("heading", { name: /Fixture ficticio/ })).toBeVisible();
    await page.screenshot({ path: `${evidence}/${info.project.name}-customer-contact-${state}.png`, animations: "disabled" });
    await page.getByText("Historial de Reservas", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/${info.project.name}-customer-bookings-${state}.png`, animations: "disabled" });
    await page.getByText("FAC-2026-OPERACION-INDUSTRIAL-00000012340", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/${info.project.name}-customer-invoices-${state}.png`, animations: "disabled" });
    const geometry = await page.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, mainWidth: document.querySelector("main")!.scrollWidth, rows: [...document.querySelectorAll('[role="button"]')].map(row => { const r = row.getBoundingClientRect(); return { width: r.width, scrollWidth: row.scrollWidth, text: row.textContent }; }) }));
    // The before fixture preserves its original overflow for comparison.
    if (state === "after") assertImprovedWidths(geometry);
    await context.unrouteAll({ behavior: "wait" });
    expect(errors).toEqual([]); expect(transport.unexpected).toEqual([]); expect(transport.externalBlocked).toEqual([]);
    writeFileSync(`${evidence}/${info.project.name}-customer-${state}-geometry.json`, JSON.stringify({ geometry, errors, ...transport }, null, 2));
  });
}
