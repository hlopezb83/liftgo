import { test, expect, clientFromPage } from "./fixtures/seed";
import { TIMEOUTS } from "./fixtures/helpers";

test("editar conserva los valores exactos de una cotización propia tras el refetch", async ({ page, seed }) => {
  const client = await clientFromPage(page);
  const original = await client.from("quotes").select("*").eq("id", seed.quote_id).single();
  expect(original.error).toBeNull();
  const fields = ["customer_id", "customer_name", "forklift_id", "equipment_model_id", "start_date",
    "end_date", "line_items", "subtotal", "tax_rate", "tax_amount", "total", "currency", "quote_type"];
  const payload = Object.fromEntries(fields.map((key) => [key, original.data?.[key]]));
  const notes = "Precarga exacta " + seed.scope;
  const created = await client.from("quotes").insert({
    ...payload, organization_id: original.data?.organization_id, quote_number: "", status: "draft", notes,
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
