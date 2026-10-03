import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import process from "node:process";
import postgres from "postgres";

/** Refuse all endpoints except the disposable database created by these CI jobs. */
export function diagnosticDatabaseUrl(env) {
  const url = new URL(env.DB_URL || "");
  if (env.CI !== "true" || url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1"
    || url.port !== "54322" || url.pathname !== "/postgres" || url.username !== "postgres"
    || url.search || url.hash) throw new Error("El diagnóstico requiere PostgreSQL efímero de CI.");
  return url.href;
}

async function diagnose(env) {
  const connection = postgres(diagnosticDatabaseUrl(env), { max: 1, onnotice: () => {} });
  const rollback = new Error("diagnostic-rollback");
  let current = "journal";
  try {
    const journal = JSON.parse(await readFile("drizzle/migrations/meta/_journal.json", "utf8"));
    await connection.begin(async (tx) => {
      const table = await tx`select to_regclass('drizzle.__drizzle_migrations') as id`;
      const applied = table[0].id ? await tx`select coalesce(max(created_at),0) as cutoff from drizzle.__drizzle_migrations` : [{ cutoff: 0 }];
      for (const entry of journal.entries) {
        if (Number(entry.when) <= Number(applied[0].cutoff)) continue;
        current = entry.tag;
        const sql = await readFile(`drizzle/migrations/${entry.tag}.sql`, "utf8");
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
