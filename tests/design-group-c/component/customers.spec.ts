import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { evidenceRoot as evidence } from "../paths";
import { getComponentTransportLedgers, installComponentTransport } from "./transport";
import { closeOfflinePages } from "../../offlineTeardown";

function assertImprovedWidths(geometry: { viewport: number; documentWidth: number; mainWidth: number; rows: Array<{ width: number; scrollWidth: number }> }) {
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.mainWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  for (const row of geometry.rows) expect(row.scrollWidth).toBeLessThanOrEqual(row.width + 1);
}
mkdirSync(evidence, { recursive: true });

test.afterEach(async ({ context }, info) => {
  const teardownErrors = await closeOfflinePages(context);
  const transports = getComponentTransportLedgers(context);
  writeFileSync(`${evidence}/${info.project.name}-${info.title.replace(/\W+/g, "-").slice(0, 64)}-${info.testId}-final-network.json`, JSON.stringify({ phase: "after-pages-closed", transports, teardownErrors }, null, 2));
  for (const ledger of transports) {
    expect.soft(ledger.errors).toEqual([]); expect.soft(ledger.unexpected).toEqual([]); expect.soft(ledger.externalBlocked).toEqual([]);
  }
  expect(teardownErrors).toEqual([]);
});

for (const state of ["before", "after"] as const) {
  test(`${state} customer detail long history`, async ({ context, page }, info) => {
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
    writeFileSync(`${evidence}/${info.project.name}-customer-${state}-geometry.json`, JSON.stringify({ geometry, ...transport }, null, 2));
  });
}
