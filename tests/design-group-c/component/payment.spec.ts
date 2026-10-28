import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { evidenceRoot as evidence } from "../paths";
import { getComponentTransportLedgers, installComponentTransport } from "./transport";
import { closeOfflinePages } from "../../offlineTeardown";
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
  for (const currency of ["USD", "MXN"] as const) {
    test(`${state} ${currency} payment labels and safe close`, async ({ context, page }, info) => {
      const transport = await installComponentTransport(context);
      await page.goto(`/tests/design-group-c/component/index.html?state=${state}&currency=${currency}`);
      const dialog = page.getByRole("dialog", { name: /Registrar pago/ });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel(/Monto/).blur();
      await expect(dialog.getByLabel(/Monto/)).toHaveValue("1,234,567,890.12");
      const fieldCurrency = await dialog.getByLabel(/Monto/).locator("..").getByText(/^(MXN|USD)$/).evaluate(el => el.textContent);
      expect(fieldCurrency).toBe(state === "before" ? "MXN" : currency);
      await page.screenshot({ path: `${evidence}/${info.project.name}-payment-${state}-${currency}.png`, animations: "disabled" });
      await dialog.getByLabel(/Referencia/).fill("QA-REFERENCIA-FICTICIA");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page.getByRole("button", { name: "Seguir editando" }).click();
      await expect(dialog.getByLabel(/Referencia/)).toHaveValue("QA-REFERENCIA-FICTICIA");
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
      await page.getByRole("button", { name: "Descartar", exact: true }).click();
      await expect(dialog).toBeHidden();
      writeFileSync(`${evidence}/${info.project.name}-payment-${state}-${currency}.json`, JSON.stringify({ state, currency, fieldCurrency, rawAmount: 1234567890.12, ...transport }, null, 2));
    });
  }
}
