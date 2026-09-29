import { describe, expect, it } from "vitest";
import {
  groupForkliftsForGantt,
  type GanttForklift,
} from "../ganttEquipmentGroups";

function forklift(id: string, status: GanttForklift["status"]): GanttForklift {
  return {
    id,
    name: id,
    manufacturer: "LiftGo",
    model: "H25",
    status,
  } as GanttForklift;
}

describe("groupForkliftsForGantt", () => {
  it("does not classify maintenance, rented, retired, or sold units as available", () => {
    const groups = groupForkliftsForGantt(
      [
        forklift("available", "available"),
        forklift("maintenance", "maintenance"),
        forklift("rented", "rented"),
        forklift("retired", "retired"),
        forklift("sold", "sold"),
      ],
      new Set(),
    );

    expect(groups.available.map((item) => item.id)).toEqual(["available"]);
    expect(groups.maintenance.map((item) => item.id)).toEqual(["maintenance"]);
    expect(groups.rented.map((item) => item.id)).toEqual(["rented"]);
    expect(groups.retired.map((item) => item.id)).toEqual(["retired"]);
    expect(groups.sold.map((item) => item.id)).toEqual(["sold"]);
  });

  it("keeps equipment with a confirmed booking in the active timeline group", () => {
    const groups = groupForkliftsForGantt(
      [forklift("rented", "rented"), forklift("available", "available")],
      new Set(["rented"]),
    );

    expect(groups.active.map((item) => item.id)).toEqual(["rented"]);
    expect(groups.available.map((item) => item.id)).toEqual(["available"]);
    expect(groups.rented).toEqual([]);
  });
});
