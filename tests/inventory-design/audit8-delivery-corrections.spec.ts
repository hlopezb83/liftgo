import { expect, test, type BrowserContext } from "@playwright/test";
import { forkliftId, installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

const backend = "http://127.0.0.1:54321";
const deliveryId = "00000000-0000-4000-8000-000000000811";
const bookingId = "00000000-0000-4000-8000-000000000812";
const organizationId = "00000000-0000-4000-8000-000000000002";
const deliveryNumber = "QA-ENT-AUDIT8";
// Yesterday's civil date keeps the synthetic auth session valid while testing
// a browser whose current Monterrey time is 09:00, before the old noon value.
const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const morning = new Date(`${day}T09:00:00-06:00`);

async function installCorrections(context: BrowserContext, origin: string) {
  const audit = await installGroupCTransport(context, origin);
  const state = { financialReads: 0, daysRented: 100, writes: [] as Array<{ rpc: string; args: Record<string, unknown> }> };
  const delivery = {
    id: deliveryId, organization_id: organizationId, delivery_number: deliveryNumber,
    type: "delivery", status: "completed", forklift_id: forkliftId, booking_id: bookingId,
    scheduled_date: "2026-10-01", scheduled_time: null, completed_at: "2026-10-01T18:00:00Z",
    address: "Patio ficticio", driver_name: "Operador QA", driver_phone: null, hours_reading: null,
    transport_cost: null, charged_to_customer: false, notes: null, signature_base64: null,
    completed_no_evidence_reason: null, created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
    forklifts: { name: "Equipo QA", model: "Modelo QA" }, historical_reconciliation: null,
  };
  const booking = { id: bookingId, forklift_id: forkliftId, organization_id: organizationId,
    booking_number: "QA-RES-AUDIT8", customer_name: "Cliente ficticio", status: "active",
    start_date: "2026-10-01", end_date: "2026-12-01", rental_type: "daily", daily_rate: 1000,
    total_amount: 1000, customer_id: null, delivery_date: "2026-10-01", is_e2e: false };
  await context.route(`${backend}/rest/v1/**`, async (route) => {
    const request = route.request(), url = new URL(request.url()), endpoint = url.pathname.split("/").pop()!;
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json",
      headers: { "access-control-allow-origin": origin }, body: JSON.stringify(data) });
    if (request.method() === "GET" && endpoint === "deliveries") {
      return json(request.headers().accept?.includes("vnd.pgrst.object") ? delivery : [delivery]);
    }
    if (request.method() === "GET" && endpoint === "bookings") {
      return json(request.headers().accept?.includes("vnd.pgrst.object") ? booking : [booking]);
    }
    if (request.method() !== "POST" || !url.pathname.includes("/rpc/")) return route.fallback();
    if (endpoint === "get_forklift_financials") {
      state.financialReads++;
      return json({ revenue: 1000, maintenance_cost: 100, acquisition_cost: 10000, gross_margin: 900,
        roi_percent: 9, days_rented: state.daysRented, days_since_acquired: 200,
        utilization_percent: state.daysRented / 2, hourometer_history: [] });
    }
    if (endpoint === "get_deliveries_page") return json({ items: [delivery], totalCount: 1, overdueCount: 0, pageIndex: 0, today: day });
    if (!["correct_delivery_completed_at", "void_completed_delivery"].includes(endpoint)) return route.fallback();
    const args = request.postDataJSON() as Record<string, unknown>;
    expect(args.p_delivery_id).toBe(deliveryId);
    expect(args.p_reason).toBe("Corrección ficticia para QA");
    state.writes.push({ rpc: endpoint, args });
    if (endpoint === "correct_delivery_completed_at") {
      if (new Date(String(args.p_completed_at)).getTime() > morning.getTime()) {
        return json({ code: "P0001", message: "La fecha de entrega no puede estar en el futuro" }, 400);
      }
      delivery.completed_at = String(args.p_completed_at);
      state.daysRented = 99;
    } else { delivery.status = "cancelled"; state.daysRented = 0; }
    return json(deliveryId);
  });
  return { audit, state };
}

for (const operation of ["correct", "void"] as const) {
  test(`delivery ${operation} refreshes the previously viewed financial summary`, async ({ page, context, baseURL }, info) => {
    const transport = await installCorrections(context, new URL(baseURL!).origin);
    let documentRequests = 0;
    page.on("request", request => {
      if (request.isNavigationRequest() && request.resourceType() === "document") documentRequests++;
    });
    await page.clock.setFixedTime(morning);
    try {
      await page.goto(`/fleet/${forkliftId}`);
      const days = page.getByText("Días fuera", { exact: true }).locator("..").locator("p").last();
      await expect(days).toHaveText("100");
      const firstReads = transport.state.financialReads;
      if (info.project.name.startsWith("mobile-")) await page.getByRole("button", { name: "Alternar barra lateral", exact: true }).click();
      await page.getByRole("link", { name: "Entregas", exact: true }).click();
      await page.getByText(deliveryNumber, { exact: true }).click();
      await expect(page.getByRole("heading", { name: deliveryNumber, exact: true })).toBeVisible();
      await page.getByRole("button", { name: operation === "correct" ? "Corregir fecha" : "Anular", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: `${operation === "correct" ? "Corregir fecha de" : "Anular"} ${deliveryNumber}`, exact: true });
      await dialog.getByLabel("Motivo de la corrección", { exact: true }).fill("Corrección ficticia para QA");
      if (operation === "correct") await dialog.getByLabel("Fecha real de entrega", { exact: true }).fill(day);
      await dialog.getByRole("button", { name: operation === "correct" ? "Guardar fecha" : "Anular entrega", exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(transport.state.writes).toHaveLength(1);
      expect(transport.state.writes[0]).toEqual({
        rpc: operation === "correct" ? "correct_delivery_completed_at" : "void_completed_delivery",
        args: { p_delivery_id: deliveryId, p_reason: "Corrección ficticia para QA",
          ...(operation === "correct" ? { p_completed_at: `${day}T06:00:00.000Z` } : {}) },
      });
      await page.goBack();
      await expect(page).toHaveURL(/\/deliveries$/);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/fleet/${forkliftId}$`));
      await expect(days).toHaveText(operation === "correct" ? "99" : "0");
      expect(transport.state.financialReads).toBeGreaterThan(firstReads);
      expect(documentRequests).toBe(1);
      await days.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`financial-summary-${operation}.png`), animations: "disabled" });
    } finally {
      const teardownErrors = await closeOfflinePages(context);
      await info.attach("delivery-offline-network", { contentType: "application/json", body: JSON.stringify({ ...transport.audit, ...transport.state, documentRequests, teardownErrors }) });
      expect(teardownErrors).toEqual([]);
      expect(transport.audit.unexpected).toEqual([]);
      expect(transport.audit.pageErrors).toEqual([]);
    }
  });
}
