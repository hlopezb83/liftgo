import { describe, expect, it } from "vitest";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { initialReturnInspectionForm, returnInspectionSchema } from "./returnInspectionSchema";

describe("returnInspectionSchema", () => {
  it("permite condición sin daño sin notas ni costo", () => {
    const result = returnInspectionSchema.safeParse({
      ...initialReturnInspectionForm,
      bookingId: "b1",
      condition: "good",
      damageNotes: "",
      damageCost: "",
    });
    expect(result.success).toBe(true);
  });

  it("exige notas y costo cuando la condición implica daño", () => {
    const result = returnInspectionSchema.safeParse({
      ...initialReturnInspectionForm,
      bookingId: "b1",
      condition: "major_damage",
      damageNotes: "",
      damageCost: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("damageNotes");
      expect(paths).toContain("damageCost");
    }
  });

  it("acepta daño con notas y costo válidos (0 incluido)", () => {
    const result = returnInspectionSchema.safeParse({
      ...initialReturnInspectionForm,
      bookingId: "b1",
      condition: "minor_damage",
      damageNotes: "Rayón en el mástil",
      damageCost: "0",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza notas o costo de daño cuando la condición es 'good' (FE2-12)", () => {
    const result = returnInspectionSchema.safeParse({
      ...initialReturnInspectionForm,
      bookingId: "b1",
      condition: "good",
      damageNotes: "Rayón en el mástil",
      damageCost: "1500",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("damageNotes");
      expect(paths).toContain("damageCost");
    }
  });

  it("rechaza costos negativos y no numéricos", () => {
    const negative = returnInspectionSchema.safeParse({
      ...initialReturnInspectionForm,
      bookingId: "b1",
      condition: "minor_damage",
      damageNotes: "Abolladura",
      damageCost: "-100",
    });
    expect(negative.success).toBe(false);

    const nonNumeric = returnInspectionSchema.safeParse({
      ...initialReturnInspectionForm,
      bookingId: "b1",
      condition: "minor_damage",
      damageNotes: "Abolladura",
      damageCost: "gratis",
    });
    expect(nonNumeric.success).toBe(false);
  });

  it("rechaza horas usadas negativas", () => {
    const result = returnInspectionSchema.safeParse({
      ...initialReturnInspectionForm,
      bookingId: "b1",
      hoursUsed: "-5",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("hoursUsed");
    }
  });
});

describe("initialReturnInspectionForm — TZ Monterrey (Auditoría R9)", () => {
  it("el default de inspectedAt es una fecha válida coherente con todayKeyMty()", () => {
    // R9: el default debe construirse con nowMty() (no `new Date()` crudo), de
    // forma consistente con el resto de "hoy" de negocio del app.
    expect(initialReturnInspectionForm.inspectedAt).toBeInstanceOf(Date);
    expect(todayKeyMty()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
