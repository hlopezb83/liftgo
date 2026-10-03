import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnosticDatabaseUrl } from "../ci-drizzle-diagnostics.mjs";

const env = { CI: "true", DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" };
test("permite sólo la base local efímera que crea CI", () => {
  assert.equal(diagnosticDatabaseUrl(env), env.DB_URL);
});
test("no puede conectarse a un backend remoto, otro puerto/base/rol ni aceptar opciones", () => {
  for (const DB_URL of [
    "postgresql://postgres:fixture@project.supabase.co:54322/postgres",
    "postgresql://postgres:fixture@127.0.0.1:5432/postgres",
    "postgresql://postgres:fixture@127.0.0.1:54322/production",
    "postgresql://service:fixture@127.0.0.1:54322/postgres",
    env.DB_URL + "?options=--search_path=private",
  ]) assert.throws(() => diagnosticDatabaseUrl({ ...env, DB_URL }));
});
test("no se ejecuta con una invocación local ordinaria", () => {
  assert.throws(() => diagnosticDatabaseUrl({ ...env, CI: undefined }));
  assert.throws(() => diagnosticDatabaseUrl({ ...env, DB_URL: undefined }));
});
