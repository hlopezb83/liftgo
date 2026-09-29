import type { Tables } from "@/integrations/supabase/types";

export type GanttForklift = Pick<
  Tables<"forklifts">,
  "id" | "name" | "manufacturer" | "model" | "status"
>;

export interface GanttForkliftGroups {
  active: GanttForklift[];
  available: GanttForklift[];
  maintenance: GanttForklift[];
  rented: GanttForklift[];
  retired: GanttForklift[];
  sold: GanttForklift[];
  other: GanttForklift[];
}

/**
 * Separate equipment with a confirmed booking from units whose current fleet
 * status makes them unavailable. Only explicitly available units belong in the
 * Gantt's "Disponibles" section.
 */
export function groupForkliftsForGantt(
  forklifts: GanttForklift[],
  forkliftsWithConfirmedBooking: ReadonlySet<string>,
): GanttForkliftGroups {
  const groups: GanttForkliftGroups = {
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
