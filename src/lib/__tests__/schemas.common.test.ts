import { describe, it, expect } from "vitest";
import {
  optionalEmail,
  rfcOptional,
  rfcRequired,
  clabeOptional,
  isValidClabe,
  CLABE_REGEX,
  positiveAmount,
} from "../schemas/common";

describe("schemas/common — optionalEmail", () => {
  const schema = optionalEmail();
  it("acepta cadena vacía", () => {
    expect(schema.safeParse("").success).toBe(true);
  });
  it("acepta email válido", () => {
    expect(schema.safeParse("hola@liftgo.mx").success).toBe(true);
  });
  it("rechaza email malformado", () => {
    const r = schema.safeParse("no-es-email");
    expect(r.success).toBe(false);
  });
  it("aplica default '' cuando falta el campo", () => {
    expect(schema.parse(undefined)).toBe("");
  });
});

describe("schemas/common — rfcOptional", () => {
  const schema = rfcOptional();
  it("acepta cadena vacía", () => {
    expect(schema.parse("")).toBe("");
  });
  it("normaliza a mayúsculas con trim", () => {
    expect(schema.parse("  xaxx010101000  ")).toBe("XAXX010101000");
  });
  it("rechaza formato inválido", () => {
    expect(schema.safeParse("ABC").success).toBe(false);
  });
  it("acepta RFC persona moral (12 chars)", () => {
    expect(schema.safeParse("ABC010101XYZ").success).toBe(true);
  });
  it("acepta RFC persona física (13 chars)", () => {
    expect(schema.safeParse("ABCD010101XYZ").success).toBe(true);
  });
});

describe("schemas/common — rfcRequired", () => {
  const schema = rfcRequired();
  it("rechaza cadena vacía", () => {
    expect(schema.safeParse("").success).toBe(false);
  });
  it("acepta RFC válido normalizado", () => {
    const r = schema.safeParse("xaxx010101000");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("XAXX010101000");
  });
});

describe("schemas/common — CLABE", () => {
  it("CLABE_REGEX valida exactamente 18 dígitos", () => {
    expect(CLABE_REGEX.test("012345678901234567")).toBe(true);
    expect(CLABE_REGEX.test("01234567890123456")).toBe(false); // 17
    expect(CLABE_REGEX.test("0123456789012345678")).toBe(false); // 19
    expect(CLABE_REGEX.test("01234567890123456A")).toBe(false); // letra
  });
  it("isValidClabe acepta vacío y null como opcional", () => {
    expect(isValidClabe("")).toBe(true);
    expect(isValidClabe(null)).toBe(true);
    expect(isValidClabe(undefined)).toBe(true);
  });
  it("isValidClabe tolera espacios", () => {
    expect(isValidClabe("  012345678901234567  ")).toBe(true);
  });
  it("clabeOptional rechaza no-18-dígitos", () => {
    const schema = clabeOptional();
    expect(schema.safeParse("").success).toBe(true);
    expect(schema.safeParse("012345678901234567").success).toBe(true);
    expect(schema.safeParse("123").success).toBe(false);
  });
});

describe("schemas/common — positiveAmount (Zod 4 API)", () => {
  const schema = positiveAmount();
  it("acepta número > 0", () => {
    const r = schema.safeParse(100.5);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(100.5);
  });
  it("acepta valores muy pequeños > 0", () => {
    expect(schema.safeParse(0.01).success).toBe(true);
  });
  it("rechaza 0", () => {
    expect(schema.safeParse(0).success).toBe(false);
  });
  it("rechaza negativos", () => {
    expect(schema.safeParse(-5).success).toBe(false);
  });
  it("rechaza NaN", () => {
    expect(schema.safeParse(NaN).success).toBe(false);
  });
  it("rechaza undefined", () => {
    expect(schema.safeParse(undefined).success).toBe(false);
  });
  it("rechaza null", () => {
    expect(schema.safeParse(null).success).toBe(false);
  });
  it("rechaza strings numéricos (sin coerción)", () => {
    expect(schema.safeParse("100").success).toBe(false);
  });
  it("usa mensaje custom en error de tipo", () => {
    const custom = positiveAmount("Monto inválido");
    const r = custom.safeParse("abc");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Monto inválido");
  });
  it("usa mensaje custom en error de rango (≤ 0)", () => {
    const custom = positiveAmount("Monto inválido");
    const r = custom.safeParse(-1);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Monto inválido");
  });
  it("compone con .optional() sin efectos colaterales", () => {
    const optional = positiveAmount().optional();
    expect(optional.safeParse(undefined).success).toBe(true);
    expect(optional.safeParse(10).success).toBe(true);
    expect(optional.safeParse(0).success).toBe(false);
  });
});

