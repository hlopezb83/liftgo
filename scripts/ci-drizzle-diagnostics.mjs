import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import process from "node:process";
import postgres from "postgres";
import { ciDatabaseUrl, validateReplay, assertReplayLedger } from "./ci-drizzle-replay.mjs";

/** Refuse all endpoints except the disposable database created by these CI jobs. */
export function diagnosticDatabaseUrl(env) {
  return ciDatabaseUrl(env);
}

async function diagnose(env) {
  const replay = validateReplay({ env });
  const connection = postgres(diagnosticDatabaseUrl(env), { max: 1, onnotice: () => {} });
  const rollback = new Error("diagnostic-rollback");
  let current = "journal";
  try {
    const journal = replay.journal;
    await connection.begin(async (tx) => {
      const table = await tx`select to_regclass('drizzle.__drizzle_migrations') as id`;
      const applied = table[0].id ? await tx`select hash, created_at from drizzle.__drizzle_migrations order by created_at` : [];
      assertReplayLedger(applied, replay.entries, { allowPrefix: true });
      const cutoff = applied.length ? Number(applied[applied.length - 1].created_at) : 0;
      for (const entry of journal.entries) {
        if (Number(entry.when) <= cutoff) continue;
        current = entry.tag;
        const sql = await readFile(`${replay.migrationsDir}/${entry.tag}.sql`, "utf8");
        for (const statement of sql.split("--> statement-breakpoint")) {
          if (statement.trim()) await tx.unsafe(statement, [], { prepare: false });
        }
      }
      // Diagnóstico, nunca un segundo rollout: incluso el éxito revierte todo.
      throw rollback;
    });
  } catch (error) {
    if (error === rollback) console.info("Las migraciones pendientes ejecutaron en el diagnóstico; todo se revirtió.");
    else {
      console.error("Error PostgreSQL en migración", current, {
        code: error.code || "unknown", message: error.message, position: error.position,
      });
      process.exitCode = 1;
    }
  } finally {
    await connection.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await diagnose(process.env);
}
