import { describe, it, expect } from "vitest";
import { createEntityKeys } from "../query/createEntityKeys";

describe("createEntityKeys", () => {
  const keys = createEntityKeys("contracts");

  it("all devuelve tupla estable con root", () => {
    expect(keys.all).toEqual(["contracts"]);
  });

  it("lists() añade segmento 'list'", () => {
    expect(keys.lists()).toEqual(["contracts", "list"]);
  });

  it("byFilter incluye el objeto de filtro", () => {
    const f = { status: "draft" };
    expect(keys.byFilter(f)).toEqual(["contracts", "list", f]);
  });

  it("details() añade segmento 'detail'", () => {
    expect(keys.details()).toEqual(["contracts", "detail"]);
  });

  it("detail(id) incluye el id", () => {
    expect(keys.detail("abc-123")).toEqual(["contracts", "detail", "abc-123"]);
  });

  it("dos factories con distinto root no colisionan", () => {
    const quotes = createEntityKeys("quotes");
    expect(quotes.all).not.toEqual(keys.all);
    expect(quotes.detail("x")).toEqual(["quotes", "detail", "x"]);
  });

  it("las tuplas son estables entre llamadas (mismos valores)", () => {
    expect(keys.lists()).toEqual(keys.lists());
  });
});
