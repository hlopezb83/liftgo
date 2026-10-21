import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { callRpc } from "@/lib/rpc";
import { explainUnavailableUnit, overlapsRequestedRange, type AvailabilityBooking, type AvailabilityUnit } from "../../lib/availabilityReasons";

const PAGE_SIZE = 200;
type AvailabilityUnitRow = Pick<Tables<"forklifts">, keyof AvailabilityUnit>;

async function readUnits(organizationId: string, signal?: AbortSignal): Promise<AvailabilityUnit[]> {
  const rows: AvailabilityUnit[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let request = supabase.from("forklifts")
      .select("id, name, model, status, organization_id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or("is_e2e.is.null,is_e2e.eq.false")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    const page = data ?? [];
    for (const row of page) {
      // Supabase permits a null organization on legacy fleet rows. Only copy
      // the organization after the equality check has narrowed it to string.
      if (row.organization_id !== organizationId) continue;
      rows.push({ ...row, organization_id: row.organization_id });
    }
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function readBookings(organizationId: string, end: string, signal?: AbortSignal): Promise<AvailabilityBooking[]> {
  const rows: AvailabilityBooking[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let request = supabase.from("bookings")
      .select("id, forklift_id, organization_id, status, start_date, end_date")
      .eq("organization_id", organizationId)
      .not("status", "in", "(completed,cancelled)")
      .or("is_e2e.is.null,is_e2e.eq.false")
      .lte("start_date", end)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page.filter((row) => row.organization_id === organizationId));
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** Bound the optional, existing boolean predicates to four units at a time. */
async function mapUnits<T>(units: AvailabilityUnit[], fn: (unit: AvailabilityUnit) => Promise<T>): Promise<T[]> {
  const results = new Array<T>(units.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, units.length) }, async () => {
    while (next < units.length) {
      const index = next++;
      results[index] = await fn(units[index]);
    }
  }));
  return results;
}

export async function fetchAvailabilityReasons({ organizationId, start, end, canReadBookings, signal }: {
  organizationId: string;
  start: string;
  end: string;
  canReadBookings: boolean;
  signal?: AbortSignal;
}) {
  if (!organizationId || !start || !end || end < start) throw new Error("Consulta de disponibilidad inválida");
  const [units, available, today] = await Promise.all([
    readUnits(organizationId, signal),
    callRpc<AvailabilityUnitRow[]>("get_available_forklifts", { p_start_date: start, p_end_date: end }, { signal }),
    callRpc<string>("today_mty", {}, { signal }),
  ]);
  // Match only the verified company's fleet. An unrelated cached/returned row
  // can neither appear nor suppress an unavailable unit from this company.
  const availableIds = new Set(available.filter((row) => row.organization_id === organizationId).map((row) => row.id));
  let evidenceIncomplete = !canReadBookings;
  let bookings: AvailabilityBooking[] = [];
  if (canReadBookings) {
    try {
      bookings = await readBookings(organizationId, end > today ? end : today, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      evidenceIncomplete = true;
    }
  }
  const unavailable = await mapUnits(units.filter((unit) => !availableIds.has(unit.id)), async (unit) => {
    let maintenanceBlocked: boolean | undefined;
    let overdueUnreturned: boolean | undefined;
    const unitBookings = bookings.filter((booking) => booking.forklift_id === unit.id);
    // No mutation or manual status correction is part of this read path.
    if (!["retired", "sold", "maintenance"].includes(unit.status)) {
      try {
        maintenanceBlocked = await callRpc<boolean>("forklift_has_maintenance_block", {
          p_org: organizationId, p_forklift: unit.id, p_start: start, p_end: end,
        }, { signal });
        if (!maintenanceBlocked) {
          for (const booking of unitBookings) {
            if (booking.status !== "confirmed" || booking.start_date > today || booking.end_date >= today) continue;
            const returned = await callRpc<boolean>("booking_is_returned", { p_booking_id: booking.id }, { signal });
            if (returned === false) {
              overdueUnreturned = true;
              break;
            }
          }
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        evidenceIncomplete = true;
      }
    }
    const overlappingBooking = unitBookings
      .filter((booking) => overlapsRequestedRange(booking, start, end))
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id))[0];
    return { unit, reason: explainUnavailableUnit({ unit, maintenanceBlocked, overdueUnreturned, overlappingBooking }) };
  });
  return {
    unavailable: unavailable.sort((a, b) => a.unit.name.localeCompare(b.unit.name)),
    reservableWhileRented: units.filter((unit) => availableIds.has(unit.id) && unit.status === "rented"),
    evidenceIncomplete,
  };
}
