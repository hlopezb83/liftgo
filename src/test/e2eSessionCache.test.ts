import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeSessionCache } from "../../tests/e2e/fixtures/sessionCache";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "liftgo-session-cache-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("caché de sesiones E2E", () => {
  it("crea el directorio y reemplaza el caché por un JSON completo", () => {
    const path = join(directory, ".auth", "admin.json");
    writeSessionCache(path, JSON.stringify({ token: "old-test-token" }));
    const next = { token: "new-test-token", payload: "x".repeat(100_000) };
    writeSessionCache(path, JSON.stringify(next));
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(next);
    expect(readdirSync(join(directory, ".auth"))).toEqual(["admin.json"]);
  });

  it("limpia el temporal si no puede publicar y conserva el destino", () => {
    const path = join(directory, "blocked.json");
    mkdirSync(path);
    expect(() => writeSessionCache(path, "{}")).toThrow();
    expect(statSync(path).isDirectory()).toBe(true);
    expect(readdirSync(directory)).toEqual(["blocked.json"]);
  });

  it.skipIf(process.platform === "win32")("limita los permisos de la sesión al propietario", () => {
    const path = join(directory, "admin.json");
    writeSessionCache(path, "{}");
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
