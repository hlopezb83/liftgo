import { describe, expect, it } from "vitest";
import { extractStoragePath } from "../documentsQueryKeys";

describe("Document storage paths", () => {
  it("recupera la ruta relativa que guarda el upload para firmar y limpiar el objeto", () => {
    expect(extractStoragePath("documents/org-a/damage_record/damage-1/panel.png"))
      .toBe("org-a/damage_record/damage-1/panel.png");
  });

  it("conserva las URLs históricas y omite el token de una URL firmada", () => {
    expect(extractStoragePath("https://storage.example/storage/v1/object/public/documents/org-a/panel.png"))
      .toBe("org-a/panel.png");
    expect(extractStoragePath("https://storage.example/storage/v1/object/sign/documents/org-a/panel.png?token=expired"))
      .toBe("org-a/panel.png");
  });

  it("no interpreta una ruta ajena o vacía como objeto del bucket", () => {
    expect(extractStoragePath("https://example.com/photo.png")).toBeNull();
    expect(extractStoragePath("documents/")).toBeNull();
  });
});
