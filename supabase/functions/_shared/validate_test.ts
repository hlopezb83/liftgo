// Tests unitarios para validate.ts y generateSecurePassword (Lote 9).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isEmail, isNonEmptyString, isUUID, isValidRole } from "./validate.ts";
import { generateSecurePassword } from "./auth.ts";

Deno.test("isUUID acepta v4 válido", () => {
  assert(isUUID("550e8400-e29b-41d4-a716-446655440000"));
});

Deno.test("isUUID rechaza no-strings y formatos inválidos", () => {
  assertEquals(isUUID(null), false);
  assertEquals(isUUID(123), false);
  assertEquals(isUUID("no-uuid"), false);
  assertEquals(isUUID("550e8400-e29b-41d4-a716-44665544000"), false); // 1 char menos
});

Deno.test("isEmail valida casos correctos", () => {
  assert(isEmail("foo@bar.com"));
  assert(isEmail("user.name+tag@sub.example.mx"));
});

Deno.test("isEmail rechaza puntos consecutivos y bordes", () => {
  assertEquals(isEmail("foo..bar@x.com"), false);
  assertEquals(isEmail(".foo@x.com"), false);
  assertEquals(isEmail("foo.@x.com"), false);
});

Deno.test("isEmail rechaza TLD numérico o de 1 char", () => {
  assertEquals(isEmail("foo@bar.c"), false);
  assertEquals(isEmail("foo@bar.123"), false);
});

Deno.test("isEmail rechaza largos fuera de rango", () => {
  assertEquals(isEmail("a@b.c"), false); // < 6
  assertEquals(isEmail(`${"a".repeat(250)}@bar.com`), false); // > 254
});

Deno.test("isNonEmptyString respeta whitespace y maxLen", () => {
  assert(isNonEmptyString("hola"));
  assertEquals(isNonEmptyString("   "), false);
  assertEquals(isNonEmptyString(""), false);
  assertEquals(isNonEmptyString(null), false);
  assertEquals(isNonEmptyString("a".repeat(501)), false);
  assert(isNonEmptyString("a".repeat(10), 10));
});

Deno.test("isValidRole acepta solo roles canónicos", () => {
  for (
    const r of [
      "admin",
      "administrativo",
      "dispatcher",
      "mechanic",
      "auditor",
      "ventas",
    ]
  ) {
    assert(isValidRole(r));
  }
  assertEquals(isValidRole("ADMIN"), false);
  assertEquals(isValidRole("super"), false);
  assertEquals(isValidRole(null), false);
});

Deno.test("generateSecurePassword respeta longitud y charset", () => {
  const charset = /^[a-zA-Z0-9!@#$%&*]+$/;
  for (const len of [8, 20, 32]) {
    const pw = generateSecurePassword(len);
    assertEquals(pw.length, len);
    assert(charset.test(pw), `password contiene chars inválidos: ${pw}`);
  }
});

Deno.test("generateSecurePassword produce salidas distintas (entropía)", () => {
  const a = generateSecurePassword(32);
  const b = generateSecurePassword(32);
  assert(a !== b);
});
