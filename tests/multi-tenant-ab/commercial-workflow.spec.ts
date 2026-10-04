import { test, expect } from "./fixtures/staffScenario";
import { expectNoToastError } from "../e2e/fixtures/helpers";

test("cotización nueva → aceptación UI → conversión UI → factura persistida", async ({ page, scenario }) => {
  const { client, ids, organizationId } = scenario;
  const source = await client.from("quotes").select("*").eq("id", ids.quote_id).single();
  expect(source.error).toBeNull();
  if (!source.data) throw new Error("Falta cotización base");
  const start = new Date(source.data.start_date);
  start.setDate(start.getDate() + 40);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  const ymd = (date: Date) => date.toISOString().slice(0, 10);
  const quote = await client.from("quotes").insert({
    organization_id: organizationId, quote_number: "", customer_id: ids.customer_id,
    customer_name: source.data.customer_name, forklift_id: ids.forklift_id,
    equipment_model_id: null, rental_meta: null, quote_type: "rental", currency: "MXN",
    start_date: ymd(start), end_date: ymd(end), valid_until: ymd(end),
    line_items: [{ description: "Renta diaria local", quantity: 3, unit_price: 500, total: 1500 }],
    subtotal: 1500, tax_rate: 16, tax_amount: 240, total: 1740,
    status: "draft",
  }).select("*").single();
  expect(quote.error).toBeNull();
  if (!quote.data) throw new Error("No se creó la cotización");
  const quoteId = quote.data.id as string;
  scenario.track("quotes", quoteId);
  const before = await client.from("bookings").select("id").eq("quote_id", quoteId);
  expect(before.error).toBeNull();
  expect(before.data).toEqual([]);
  await page.goto("/quotes/" + quoteId);
  await expect(page.getByText(quote.data.quote_number).first()).toBeVisible();
  await page.getByRole("button", { name: /marcar.*enviada/i }).click();
  await page.getByRole("button", { name: "Aceptar", exact: true }).click();
  await page.getByRole("button", { name: "Convertir a Reserva", exact: true }).click();
  await page.getByTestId("convert-quote-confirm").click();
  await expect.poll(async () => {
    const result = await client.from("bookings").select("id").eq("quote_id", quoteId);
    expect(result.error).toBeNull();
    return result.data?.length;
  }).toBe(1);
  const booking = await client.from("bookings").select("*").eq("quote_id", quoteId).single();
  expect(booking.error).toBeNull();
  if (!booking.data) throw new Error("No se creó la reserva");
  scenario.track("bookings", booking.data.id);
  expect(booking.data).toMatchObject({ customer_id: ids.customer_id, forklift_id: ids.forklift_id,
    quote_id: quoteId, organization_id: organizationId });
  await expectNoToastError(page);
  const invoice = await client.rpc("save_invoice_with_bookings", {
    p_invoice: { customer_id: ids.customer_id, customer_name: source.data.customer_name,
      booking_id: booking.data.id, quote_id: quoteId, invoice_number: "", invoice_type: "I",
      line_items: quote.data.line_items, subtotal: 1500, tax_rate: 16, tax_amount: 240, total: 1740,
      billing_period_start: ymd(start), billing_period_end: ymd(end),
      issued_at: source.data.start_date, status: "draft", moneda: "MXN", tipo_cambio: 1 },
    p_booking_ids: [booking.data.id],
  });
  expect(invoice.error).toBeNull();
  expect(invoice.data).toHaveLength(1);
  const row = invoice.data?.[0];
  if (!row) throw new Error("No se creó la factura");
  scenario.track("invoices", row.id);
  const links = await client.from("invoice_bookings").select("booking_id").eq("invoice_id", row.id);
  expect(links.error).toBeNull();
  expect(links.data).toEqual([{ booking_id: booking.data.id }]);
  await page.goto("/invoices/" + row.id);
  await expect(page.getByText(row.invoice_number).first()).toBeVisible();
  await expectNoToastError(page);
});
