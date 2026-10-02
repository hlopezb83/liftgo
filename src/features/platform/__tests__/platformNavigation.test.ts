import { describe, expect, it } from "vitest";
import {
  isPlatformPath,
  platformEntryDestination,
  platformReturnDestination,
} from "../lib/platformNavigation";

describe("entrada y destinos de plataforma", () => {
  it.each([
    "/platform",
    "/platform/organizations",
    "/platform/catalogs",
    "/platform/audit",
    "/platform/support",
    "/platform/organizations/88000000-0000-4000-8000-000000000001",
  ])("conserva el destino permitido %s", (path) => {
    expect(platformReturnDestination(`?next=${encodeURIComponent(path)}`)).toBe(
      path,
    );
  });
  it.each([
    "https://example.com",
    "//example.com",
    "/platform/login",
    "/platform/unknown",
    "/settings/operations",
    "/platform/../users",
    "/platform/organizations/no-es-uuid",
    "/platform/organizations/88000000-0000-4000-8000-000000000001?next=//example.com",
  ])("descarta redirección no permitida %s", (path) => {
    expect(platformReturnDestination(`?next=${encodeURIComponent(path)}`)).toBe(
      "/platform",
    );
  });
  it("distingue rutas similares y conserva ERP y portal", () => {
    expect(isPlatformPath("/platform/login")).toBe(true);
    expect(isPlatformPath("/platformish")).toBe(false);
    expect(isPlatformPath("/portal")).toBe(false);
    expect(platformEntryDestination("/", "?workspace=organization")).toBeNull();
    expect(platformEntryDestination("/")).toBe("/platform");
    expect(platformEntryDestination("/settings/organizations")).toBe(
      "/platform/organizations",
    );
    expect(platformEntryDestination("/settings/catalogs")).toBe(
      "/platform/catalogs",
    );
    expect(platformEntryDestination("/bookings")).toBeNull();
    expect(platformEntryDestination("/portal")).toBeNull();
  });
});
