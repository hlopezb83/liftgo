import { describe, expect, it } from "vitest";
import { damageArchiveBlockReason } from "../useDamagePermissions";

describe("damageArchiveBlockReason", () => {
  it("mantiene la condición real (facturado o reparado)", () => {
    expect(damageArchiveBlockReason({ invoice_id: "inv", status: "reported" }).archiveBlock).toBeNull();
    expect(damageArchiveBlockReason({ invoice_id: null, status: "repaired" }).archiveBlock).toBeNull();
    const blocked = damageArchiveBlockReason({ invoice_id: null, status: "reported" });
    expect(blocked.canArchive).toBe(false);
    expect(blocked.archiveBlock?.code).toBe("damage_not_repaired");
    expect(blocked.archiveBlockReason).toContain("reparado");
  });
});
