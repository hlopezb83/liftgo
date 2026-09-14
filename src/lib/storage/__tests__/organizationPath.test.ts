import { describe, expect, it } from "vitest";
import {
  organizationStoragePath,
  organizationStoragePathForSession,
} from "../organizationPath";

describe("organizationStoragePath", () => {
  const organizationId = "2f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123";

  it("antepone la organización y normaliza la barra inicial", () => {
    expect(organizationStoragePath(organizationId, "/documents/a.pdf"))
      .toBe(`${organizationId}/documents/a.pdf`);
  });

  it("rechaza rutas que intentan salir del prefijo o contienen segmentos vacíos", () => {
    expect(() => organizationStoragePath(organizationId, "../secret.pdf"))
      .toThrow("no puede contener");
    expect(() => organizationStoragePath(organizationId, "documents//secret.pdf"))
      .toThrow("segmentos vacíos");
  });

  it("falla si la sesión no tiene organización", async () => {
    await expect(
      organizationStoragePathForSession(
        { rpc: async () => ({ data: null, error: null }) },
        "documents/a.pdf",
      ),
    ).rejects.toThrow("No se pudo resolver");
  });
});
