// Tests unitarios para los helpers de auth compartidos.
// Nota: requireAuth/requireRole hacen network calls a Supabase, así que sólo
// cubrimos las ramas de guard estático (sin Authorization header) que no
// requieren mockear el SDK. La rama con token válido se cubre indirectamente
// via los tests smoke de cada edge function que usa el helper.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateSecurePassword, requireAuth, requireRole } from "./auth.ts";

function makeReq(headers: Record<string, string> = {}) {
  return new Request("http://localhost/test", { method: "POST", headers });
}

Deno.test("requireAuth: sin Authorization → 401", async () => {
  const res = await requireAuth(makeReq());
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.response.status, 401);
    const body = await res.response.json();
    assertEquals(body.error, "Unauthorized");
  }
});

Deno.test("requireAuth: Authorization sin 'Bearer ' → 401", async () => {
  const res = await requireAuth(makeReq({ Authorization: "Basic abc" }));
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.response.status, 401);
});

Deno.test("requireRole: propaga 401 de requireAuth sin llamar a la DB", async () => {
  const res = await requireRole(makeReq(), ["admin"]);
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.response.status, 401);
});

Deno.test("generateSecurePassword: longitud por defecto y charset válido", () => {
  const pwd = generateSecurePassword();
  assertEquals(pwd.length, 20);
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  for (const ch of pwd) {
    if (!charset.includes(ch)) {
      throw new Error(`Char inválido: ${ch}`);
    }
  }
});

Deno.test("generateSecurePassword: longitud custom", () => {
  assertEquals(generateSecurePassword(32).length, 32);
  assertEquals(generateSecurePassword(8).length, 8);
});

Deno.test("generateSecurePassword: dos llamadas producen valores distintos", () => {
  const a = generateSecurePassword();
  const b = generateSecurePassword();
  if (a === b) throw new Error("Colisión inesperada en RNG");
});
