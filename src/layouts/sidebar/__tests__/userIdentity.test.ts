import { describe, expect, it } from "vitest";
import { getUserInitials } from "../userIdentity";

describe("getUserInitials", () => {
  it("usa dos partes del correo cuando hay separador", () => {
    expect(getUserInitials("juan.perez@liftgo.mx")).toBe("JP");
    expect(getUserInitials("ana_lopez@liftgo.mx")).toBe("AL");
  });

  it("usa las dos primeras letras si no hay separador", () => {
    expect(getUserInitials("admin@liftgo.mx")).toBe("AD");
  });

  it("cae en LG sin correo", () => {
    expect(getUserInitials(null)).toBe("LG");
    expect(getUserInitials("")).toBe("LG");
  });
});
