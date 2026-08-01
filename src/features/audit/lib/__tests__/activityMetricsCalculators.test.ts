import { describe, it, expect } from "vitest";
import { aggregateActivity, actorLabel } from "../activityMetricsCalculators";

describe("aggregateActivity", () => {
  it("agrupa por miembro, módulo y hora", () => {
    const rows = [
      { actor_id: "u1", actor_name: "Ana", actor_role: "Admin", entity_type: "bookings", created_at: "2026-05-26T10:00:00Z" },
      { actor_id: "u1", actor_name: "Ana", actor_role: "Admin", entity_type: "bookings", created_at: "2026-05-26T11:00:00Z" },
      { actor_id: "u2", actor_name: "Beto", actor_role: "Ventas", entity_type: "invoices", created_at: "2026-05-26T10:00:00Z" },
    ];
    const r = aggregateActivity(rows);
    expect(r.byMember).toHaveLength(2);
    expect(r.byMember[0].total).toBe(2);
    expect(r.byMember[0].actorName).toBe("Ana");
    expect(r.byModule).toHaveLength(2);
    expect(r.byModule[0].entityType).toBe("bookings");
    expect(r.byModule[0].total).toBe(2);
    expect(r.byHour).toEqual(expect.arrayContaining([
      expect.objectContaining({ total: 2 }),
      expect.objectContaining({ total: 1 }),
    ]));
  });

  it("usa 'Sistema' cuando no hay actor_name", () => {
    const r = aggregateActivity([
      { actor_id: null, actor_name: null, actor_role: null, entity_type: "x", created_at: "2026-05-26T10:00:00Z" },
    ]);
    expect(r.byMember[0].actorName).toBe("Sistema");
  });

  it("devuelve estructuras vacías sin rows", () => {
    const r = aggregateActivity([]);
    expect(r.byMember).toEqual([]);
    expect(r.byModule).toEqual([]);
    expect(r.byHour).toEqual([]);
  });

  it("guarda el lastAt más reciente por miembro", () => {
    const r = aggregateActivity([
      { actor_id: "u1", actor_name: "Ana", actor_role: null, entity_type: "x", created_at: "2026-05-01T10:00:00Z" },
      { actor_id: "u1", actor_name: "Ana", actor_role: null, entity_type: "x", created_at: "2026-05-26T10:00:00Z" },
    ]);
    expect(r.byMember[0].lastAt).toBe("2026-05-26T10:00:00Z");
  });
});

describe("actorLabel (R9-P2-07)", () => {
  it("marca como Sistema sólo los eventos sin actor", () => {
    expect(actorLabel(null, null)).toBe("Sistema");
  });

  it("no llama Sistema a un usuario con id pero sin nombre resuelto", () => {
    const label = actorLabel("a3f9b2c1-1111-2222-3333-444455556666", null);
    expect(label).not.toBe("Sistema");
    expect(label).toBe("Usuario a3f9b2c1");
  });

  it("usa el nombre cuando está disponible", () => {
    expect(actorLabel("a3f9b2c1", "Ana Torres")).toBe("Ana Torres");
  });
});
