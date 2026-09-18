import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regresión de orden temporal del journal de Drizzle.
 *
 * drizzle-orm 0.45.2 (pg-core/dialect.js) lee `select ... order by created_at desc limit 1`
 * y aplica únicamente las migraciones cuyo `folderMillis` (el `when` del journal) sea
 * ESTRICTAMENTE MAYOR que ese `created_at`. Cualquier migración pendiente con un `when`
 * menor o igual al máximo ya aplicado se omite en silencio: no falla, simplemente nunca corre.
 *
 * Baseline confirmado por SELECT de sólo lectura sobre drizzle.__drizzle_migrations:
 * el máximo `created_at` aplicado es 1790269364000 y corresponde al archivo
 * `0035_storage_manual_resolutions_force_rls` (hash del ledger == sha256 del archivo).
 * Por eso el último idx aplicado es 35: cada entrada hasta ahí tiene su fila en el ledger.
 *
 * Histórico: el canal oficial llegó a dejar copias redundantes 0036–0041 de los archivos
 * 0030–0035 con `when` anterior al baseline; nunca se aplicaron (los hashes del ledger son
 * los de 0030–0035) y drizzle jamás las habría corrido. Se retiraron como artefactos
 * redundantes; ninguna migración aplicada se editó ni se renombró.
 */
const APPLIED_MAX_CREATED_AT = 1790269364000;
const APPLIED_THROUGH_IDX = 35;

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const journal = JSON.parse(
  readFileSync("drizzle/migrations/meta/_journal.json", "utf8"),
) as { entries: JournalEntry[] };

describe("drizzle journal", () => {
  it("tiene `when` estrictamente creciente por idx", () => {
    const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);
    const invalid: string[] = [];
    for (let i = 1; i < entries.length; i += 1) {
      if (entries[i].when <= entries[i - 1].when) {
        invalid.push(
          `${entries[i].tag} (when=${entries[i].when}) no es mayor que ${entries[i - 1].tag} (when=${entries[i - 1].when})`,
        );
      }
    }
    expect(invalid).toEqual([]);
  });

  it("el baseline aplicado coincide con el último idx aplicado", () => {
    const applied = journal.entries.filter(
      (e) => e.idx <= APPLIED_THROUGH_IDX,
    );
    expect(applied.length).toBe(APPLIED_THROUGH_IDX + 1);
    const last = applied.reduce((a, b) => (a.idx > b.idx ? a : b));
    expect(last.when).toBe(APPLIED_MAX_CREATED_AT);
    const afterBaseline = applied
      .filter((e) => e.when > APPLIED_MAX_CREATED_AT)
      .map((e) => `${e.tag} (when=${e.when} > ${APPLIED_MAX_CREATED_AT})`);
    expect(afterBaseline).toEqual([]);
  });

  it("ninguna migración pendiente queda por debajo del baseline aplicado", () => {
    const pending = journal.entries.filter((e) => e.idx > APPLIED_THROUGH_IDX);
    const skipped = pending
      .filter((e) => e.when <= APPLIED_MAX_CREATED_AT)
      .map((e) => `${e.tag} (when=${e.when} <= ${APPLIED_MAX_CREATED_AT})`);
    expect(skipped).toEqual([]);
  });

  it("cada entrada del journal tiene su archivo .sql y viceversa", () => {
    const files = readdirSync("drizzle/migrations")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();
    const tags = journal.entries.map((e) => e.tag).sort();
    expect(tags).toEqual(files);
  });
});
