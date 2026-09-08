import { describe, expect, it } from "vitest";
import { parseSearch, stringifySearch } from "@/lib/searchSerialization";

describe("stringifySearch (TS-02)", () => {
  it("no entrecomilla valores que parecen números o booleanos", () => {
    expect(stringifySearch({ new: "1" })).toBe("?new=1");
    expect(stringifySearch({ from_prospect: "true" })).toBe("?from_prospect=true");
    expect(stringifySearch({ q: "123" })).toBe("?q=123");
    expect(stringifySearch({ booking_id: "bk-1", early: "1" })).toBe("?booking_id=bk-1&early=1");
  });

  it("acepta números y booleanos reales sin comillas", () => {
    expect(stringifySearch({ page: 2, activo: true })).toBe("?page=2&activo=true");
  });

  it("sin parámetros devuelve cadena vacía", () => {
    expect(stringifySearch({})).toBe("");
  });

  it("omite null y undefined pero conserva el string vacío", () => {
    expect(stringifySearch({ a: null, b: undefined, c: "" })).toBe("?c=");
  });

  it("codifica caracteres especiales", () => {
    expect(parseSearch(stringifySearch({ q: "a&b=c ñ" })).q).toBe("a&b=c ñ");
  });
});

describe("parseSearch (TS-02)", () => {
  it("es inverso de stringifySearch", () => {
    const obj = { status: "overdue", q: "123", early: "1" };
    expect(parseSearch(stringifySearch(obj))).toEqual(obj);
  });

  it("tolera '?' inicial ausente o repetido", () => {
    expect(parseSearch("status=paid")).toEqual({ status: "paid" });
    expect(parseSearch("??status=paid")).toEqual({ status: "paid" });
    expect(parseSearch("")).toEqual({});
  });
});
