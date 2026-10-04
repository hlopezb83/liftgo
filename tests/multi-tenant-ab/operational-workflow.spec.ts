import { test, expect } from "./fixtures/staffScenario";

test("entrega completada → devolución → reserva cerrada y unidad disponible", async ({ page, scenario }) => {
  const { client, ids, organizationId } = scenario;
  const booking = await client.from("bookings").select("start_date").eq("id", ids.booking_id).single();
  expect(booking.error).toBeNull();
  if (!booking.data) throw new Error("Falta reserva base");
  const delivery = await client.from("deliveries").insert({
    organization_id: organizationId, booking_id: ids.booking_id, forklift_id: ids.forklift_id,
    delivery_number: "", type: "delivery", status: "scheduled",
    scheduled_date: booking.data.start_date, driver_name: "Diego Salinas",
  }).select("id").single();
  expect(delivery.error).toBeNull();
  if (!delivery.data) throw new Error("No se creó la entrega");
  const completed = await client.rpc("complete_delivery", {
    p_delivery_id: delivery.data.id, p_hours_reading: 10,
    p_completed_no_evidence_reason: "Ensayo automatizado en backend local temporal; sin entrega física.",
  });
  expect(completed.error).toBeNull();
  expect(completed.data?.status).toBe("completed");
  const active = await client.from("bookings").select("status").eq("id", ids.booking_id).single();
  expect(active.error).toBeNull();
  // La renta operativa sigue confirmed hasta su devolución; la entrega
  // completada y el estado rented de la unidad acreditan su activación.
  expect(active.data?.status).toBe("confirmed");
  const rented = await client.from("forklifts").select("status").eq("id", ids.forklift_id).single();
  expect(rented.error).toBeNull();
  expect(rented.data?.status).toBe("rented");
  const returned = await client.rpc("complete_return_inspection", {
    p_booking_id: ids.booking_id, p_forklift_id: ids.forklift_id,
    p_condition: "good", p_hours_used: 1, p_inspected_by: "Luis Treviño", p_fuel_level: "Full",
  });
  expect(returned.error).toBeNull();
  expect(returned.data).toBeTruthy();
  const closed = await client.from("bookings").select("status, return_status").eq("id", ids.booking_id).single();
  expect(closed.error).toBeNull();
  expect(closed.data?.status).toBe("completed");
  expect(closed.data?.return_status).toBe("returned");
  const available = await client.from("forklifts").select("status").eq("id", ids.forklift_id).single();
  expect(available.error).toBeNull();
  expect(available.data?.status).toBe("available");
  await page.goto("/bookings/" + ids.booking_id);
  await expect(page.getByText(ids.booking_number).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /registrar devolución|devolución anticipada/i })).toHaveCount(0);
});
