import { spawnSync } from "node:child_process";
import { assertLocalEphemeralBackend } from "./localBackend";

function uuidLiteral(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("[cleanup] ID inválido; no se ejecutó SQL");
  }
  return "'" + value + "'::uuid";
}

/** Sólo el dueño del PostgreSQL efímero puede limpiar dependientes privados. */
function runCleanup(organizationId: string, statements: string): void {
  assertLocalEphemeralBackend("limpieza por ID");
  const dbUrl = process.env.DB_URL;
  if (!dbUrl) throw new Error("[cleanup] falta DB_URL local");
  const target = new URL(dbUrl);
  if (target.protocol !== "postgresql:" || target.hostname !== "127.0.0.1"
    || target.port !== "54322" || target.pathname !== "/postgres"
    || target.username !== "postgres") {
    throw new Error("[cleanup] SQL limitado al PostgreSQL efímero local");
  }
  const sql = "BEGIN; SELECT set_config('app.organization_id', " + uuidLiteral(organizationId)
    + "::text, true); SELECT set_config('app.e2e_teardown', 'on', true); "
    + statements + " COMMIT;";
  const result = spawnSync("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8", timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error("[cleanup] limpieza local falló: " + (result.stderr || result.error?.message || "psql no disponible"));
  }
}

export function cleanupBookingDependents(organizationId: string, bookingIds: string[]): void {
  if (!bookingIds.length) return;
  const org = uuidLiteral(organizationId);
  const ids = bookingIds.map(uuidLiteral).join(",");
  runCleanup(organizationId,
    "DELETE FROM public.return_inspections WHERE organization_id = " + org
    + " AND booking_id IN (" + ids + "); "
    + "DELETE FROM public.deliveries WHERE organization_id = " + org
    + " AND booking_id IN (" + ids + ");");
}

export function cleanupBankAccount(organizationId: string, accountId: string): void {
  const org = uuidLiteral(organizationId);
  const account = uuidLiteral(accountId);
  runCleanup(organizationId,
    "DELETE FROM public.bank_statement_lines WHERE organization_id = " + org + " AND bank_account_id = " + account + "; "
    + "DELETE FROM public.bank_statement_imports WHERE organization_id = " + org + " AND bank_account_id = " + account + "; "
    + "DELETE FROM public.bank_statement_uploads WHERE organization_id = " + org + " AND bank_account_id = " + account + "; "
    + "DELETE FROM public.bank_accounts WHERE organization_id = " + org + " AND id = " + account + ";");
}
