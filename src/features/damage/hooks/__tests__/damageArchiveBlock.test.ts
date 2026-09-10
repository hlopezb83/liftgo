import { describe, expect, it } from "vitest";
import { damageArchiveBlockReason } from "../useDamagePermissions";

describe("damageArchiveBlockReason", () => {
  it("exige reparación terminada aunque exista factura", () => {
    expect(damageArchiveBlockReason({ invoice_id: "inv", status: "reported", repaired_at: null }).canArchive).toBe(false);
    expect(damageArchiveBlockReason({ invoice_id: "inv", status: "invoiced", repaired_at: null }).canArchive).toBe(false);
    expect(damageArchiveBlockReason({ invoice_id: null, status: "repaired", repaired_at: null }).canArchive).toBe(false);
    expect(damageArchiveBlockReason({ invoice_id: null, status: "reported", repaired_at: "2026-09-09T12:00:00Z" }).canArchive).toBe(false);
    expect(damageArchiveBlockReason({ invoice_id: "inv", status: "invoiced", repaired_at: "2026-09-09T12:00:00Z" }).archiveBlock).toBeNull();
    expect(damageArchiveBlockReason({ invoice_id: null, status: "repaired", repaired_at: "2026-09-09T12:00:00Z" }).archiveBlock).toBeNull();
    const blocked = damageArchiveBlockReason({ invoice_id: null, status: "reported" });
    expect(blocked.canArchive).toBe(false);
    expect(blocked.archiveBlock?.code).toBe("damage_not_repaired");
    expect(blocked.archiveBlockReason).toContain("reparado");
  });
});
