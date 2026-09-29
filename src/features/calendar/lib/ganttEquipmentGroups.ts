import type { Tables } from "@/integrations/supabase/types";

export type GanttForklift = Pick<
  Tables<"forklifts">,
  "id" | "name" | "manufacturer" | "model" | "status"
>;

export interface GanttForkliftGroups<TForklift extends GanttForklift = GanttForklift> {
  active: TForklift[];
  available: TForklift[];
  maintenance: TForklift[];
  rented: TForklift[];
  retired: TForklift[];
  sold: TForklift[];
  other: TForklift[];
}

/**
 * Separate equipment with a confirmed booking from units whose current fleet
 * status makes them unavailable. Only explicitly available units belong in the
 * Gantt's "Disponibles" section.
 */
export function groupForkliftsForGantt<TForklift extends GanttForklift>(
  forklifts: TForklift[],
  forkliftsWithConfirmedBooking: ReadonlySet<string>,
): GanttForkliftGroups<TForklift> {
  const groups: GanttForkliftGroups<TForklift> = {
    active: [],
    available: [],
    maintenance: [],
    rented: [],
    retired: [],
    sold: [],
    other: [],
  };

  const sorted = [...forklifts].sort((a, b) => a.name.localeCompare(b.name));
  for (const forklift of sorted) {
    if (forkliftsWithConfirmedBooking.has(forklift.id)) {
      groups.active.push(forklift);
      continue;
    }

    switch (forklift.status) {
      case "available":
        groups.available.push(forklift);
        break;
      case "maintenance":
        groups.maintenance.push(forklift);
        break;
      case "rented":
        groups.rented.push(forklift);
        break;
      case "retired":
        groups.retired.push(forklift);
        break;
      case "sold":
        groups.sold.push(forklift);
        break;
      default:
        groups.other.push(forklift);
    }
  }

  return groups;
}
