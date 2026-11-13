import { expect, test } from "@playwright/test";
import { equipmentName, installGroupCTransport, modelName } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

test("maintenance equipment options remain readable within the viewport", async ({ page, context, baseURL }, info) => {
  const transport = await installGroupCTransport(context, new URL(baseURL!).origin);
  await context.route("http://127.0.0.1:54321/rest/v1/mechanics?**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ contentType: "application/json", body: "[]" });
  });
  try {
    await page.goto("/maintenance");
    await page.getByRole("button", { name: "Registrar servicio", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Registrar mantenimiento", exact: true });
    const trigger = dialog.getByRole("combobox", { name: "Montacargas", exact: true });
    await trigger.click();
    const label = `${equipmentName} — ${modelName}`;
    const option = page.getByRole("option", { name: label, exact: true });
    await expect(option).toBeVisible();
    // Finish the opening animation before measuring text, including its last line.
    await page.getByRole("listbox").evaluate(async (element) => {
      await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished));
    });
    const geometry = await option.evaluate((element) => {
      const listbox = element.closest('[role="listbox"]')!;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const text: ReturnType<DOMRect["toJSON"]>[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        text.push(...[...range.getClientRects()].map((rect) => rect.toJSON()));
      }
      return {
        viewport: innerWidth,
        listbox: listbox.getBoundingClientRect().toJSON(),
        option: element.getBoundingClientRect().toJSON(),
        text,
      };
    });
    expect(geometry.listbox.left).toBeGreaterThanOrEqual(0);
    expect(geometry.listbox.right).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.text.length).toBeGreaterThan(1);
    for (const rect of geometry.text) {
      expect(rect.left).toBeGreaterThanOrEqual(geometry.listbox.left);
      expect(rect.right).toBeLessThanOrEqual(geometry.listbox.right + 1);
      expect(rect.bottom).toBeLessThanOrEqual(geometry.option.bottom + 1);
    }
    await page.screenshot({ path: info.outputPath("maintenance-equipment-options.png"), animations: "disabled" });
    await option.click();
    await expect(trigger).toContainText(label);
    await expect(page.getByRole("listbox")).toBeHidden();
    await trigger.click();
    await expect(page.getByRole("option", { name: label, exact: true })).toHaveAttribute("aria-selected", "true");
  } finally {
    await closeOfflinePages(context);
    expect(transport.unexpected).toEqual([]);
    expect(transport.pageErrors).toEqual([]);
  }
});
