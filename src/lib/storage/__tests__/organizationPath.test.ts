import { describe, expect, it } from "vitest";
import {
  organizationStoragePath,
  organizationStoragePathForSession,
} from "../organizationPath";
import { organizationStoragePath as edgeOrganizationStoragePath } from "../../../../supabase/functions/_shared/storagePath";

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

  it("mantiene paridad cross-runtime entre cliente y Edge Functions", () => {
    const validPairs: Array<[string, string]> = [
      [organizationId, "documents/a.pdf"],
      [`  ${organizationId.toUpperCase()}  `, "///cfdi/2026/inv.xml  "],
      [organizationId, "nested/folder/file.name.pdf"],
    ];
    for (const [org, rel] of validPairs) {
      expect(organizationStoragePath(org, rel)).toBe(
        edgeOrganizationStoragePath(org, rel),
      );
    }

    const invalidPairs: Array<[string, string]> = [
      ["", "documents/a.pdf"],
      ["not-a-uuid", "documents/a.pdf"],
      [organizationId, ""],
      [organizationId, "///"],
      [organizationId, "../secret.pdf"],
      [organizationId, "documents/../secret.pdf"],
      [organizationId, "./secret.pdf"],
      [organizationId, "documents//secret.pdf"],
    ];
    for (const [org, rel] of invalidPairs) {
      expect(() => organizationStoragePath(org, rel)).toThrow();
      expect(() => edgeOrganizationStoragePath(org, rel)).toThrow();
    }
  });
});
