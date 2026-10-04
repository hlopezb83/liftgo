import { test, expect, clientFromPage } from "./fixtures/seed";
import { TIMEOUTS } from "./fixtures/helpers";

test("editar conserva los valores exactos de una cotización propia tras el refetch", async ({ page, seed }) => {
  const client = await clientFromPage(page);
  const original = await client.from("quotes").select("*").eq("id", seed.quote_id).single();
  expect(original.error).toBeNull();
  const fields = ["customer_id", "customer_name", "forklift_id", "equipment_model_id", "start_date",
    "end_date", "line_items", "subtotal", "tax_rate", "tax_amount", "total", "currency", "quote_type"];
  const payload = Object.fromEntries(fields.map((key) => [key, original.data?.[key]]));
  const customer = await client.from("customers").select("name").eq("id", seed.customer_id).single();
  expect(customer.error).toBeNull();
  if (!customer.data) throw new Error("Falta cliente propio");
  const startDate = new Date(original.data.start_date as string);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 2);
  const notes = "Precarga exacta " + seed.scope;
  const created = await client.from("quotes").insert({
    ...payload, organization_id: original.data?.organization_id, quote_number: "", status: "draft", notes,
    end_date: endDate.toISOString().slice(0, 10),
    line_items: [{ description: "Renta diaria", quantity: 3, unit_price: 625, total: 1875 }],
    subtotal: 1875, tax_amount: 300, total: 2175,
    rental_meta: [{ modelId: seed.model_id, quantity: 1, dailyRate: 625,
      weeklyRate: 3100, monthlyRate: 10000, discount: 0, discountType: "%" }],
  }).select("id").single();
  expect(created.error).toBeNull();
  expect(created.data?.id).toBeTruthy();
  if (!created.data) throw new Error("Falta cotización propia");
  const quoteId = created.data.id as string;
  try {
    await page.goto("/quotes/" + created.data?.id + "/edit");
    const form = page.locator("form").first();
    await expect(form).toBeVisible({ timeout: TIMEOUTS.medium });
    const textarea = form.locator("textarea");
    await expect(textarea).toHaveValue(notes);
    await expect(form.getByRole("combobox", { name: /^Cliente/ })).toContainText(customer.data.name);
    await expect(form.locator('input[type="number"]').first()).toHaveValue("1");
    const rates = form.locator('input[placeholder="0.00"]');
    await expect(rates.nth(0)).toHaveValue("625");
    await expect(rates.nth(1)).toHaveValue("3100");
    await expect(rates.nth(2)).toHaveValue("10000");
    const before = await form.locator("input:visible").evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value));
    expect(before.filter((value) => value !== "").length).toBeGreaterThan(0);
    // eslint-disable-next-line playwright/no-wait-for-timeout -- Reproduce la ventana de corrupción por reset tardío.
    await page.waitForTimeout(1500);
    await expect(textarea).toHaveValue(notes);
    expect(await form.locator("input:visible").evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value))).toEqual(before);
  } finally {
    const cleanup = await client.from("quotes").delete().eq("id", quoteId).select("id");
    expect(cleanup.error).toBeNull();
    expect(cleanup.data).toEqual([{ id: quoteId }]);
  }
});
