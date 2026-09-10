import { describe, expect, it } from "vitest";
import { isForkliftSelectableForAssignment } from "../../../lib/equipmentAssignmentAvailability";

describe("isForkliftSelectableForAssignment", () => {
  it("respeta exactamente los IDs devueltos por get_available_forklifts", () => {
    const availableIds = new Set(["forklift-ok"]);

    expect(isForkliftSelectableForAssignment(
      { id: "forklift-ok", status: "available" },
      availableIds,
      new Set(),
    )).toBe(true);
    expect(isForkliftSelectableForAssignment(
      { id: "forklift-with-waiting-parts", status: "available" },
      availableIds,
      new Set(),
    )).toBe(false);
  });

  it("un estado físico bloqueado prevalece aunque la RPC lo devolviera", () => {
    expect(isForkliftSelectableForAssignment(
      { id: "forklift-maintenance", status: "maintenance" },
      new Set(["forklift-maintenance"]),
      undefined,
    )).toBe(false);
  });
});
