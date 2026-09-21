/**
 * Consultas de SÓLO LECTURA sobre la copia restaurada.
 *
 * Todas corren dentro de una transacción READ ONLY con timeouts fijos y
 * devuelven únicamente agregados numéricos o etiquetas enmascaradas.
 */

import { buildOrgLabels, labelFor } from "./masking";
import type { FolioAggregate, LedgerState, StorageAggregate, TableCount } from "./report";

/** Firma mínima de la API de `postgres` que usamos (tagged template). */
export type SqlClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsafe: (query: string, params?: any[]) => Promise<any[]>;
};

/** Tablas operativas principales que se cuentan en agregado. */
export const OPERATIONAL_TABLES = [
  "organizations",
  "organization_memberships",
  "customers",
  "organization_customers",
  "forklifts",
  "bookings",
  "contracts",
  "quotes",
  "invoices",
  "payments",
  "documents",
  "user_roles",
] as const;

export async function readLedger(sql: SqlClient): Promise<LedgerState> {
  const supabase = await sql.unsafe(
    `select count(*)::int as n, max(version) as last
       from supabase_migrations.schema_migrations`,
  );
  const drizzle = await sql.unsafe(
    `select count(*)::int as n, left(max(hash), 8) as last
       from drizzle.__drizzle_migrations`,
  );
  return {
    supabaseMigrations: Number(supabase[0]?.n ?? 0),
    drizzleMigrations: Number(drizzle[0]?.n ?? 0),
    lastSupabaseVersion: supabase[0]?.last ? String(supabase[0].last) : null,
    lastDrizzleHashPrefix: drizzle[0]?.last ? String(drizzle[0].last) : null,
  };
}

export async function readTableCounts(sql: SqlClient): Promise<TableCount[]> {
  const out: TableCount[] = [];
  for (const table of OPERATIONAL_TABLES) {
    const rows = await sql.unsafe(`select count(*)::int as n from public.${table}`);
    out.push({ table, rows: Number(rows[0]?.n ?? 0) });
  }
  return out;
}

export async function readActiveOrganizations(sql: SqlClient): Promise<number> {
  const rows = await sql.unsafe(`select count(*)::int as n from public.organizations where is_active`);
  return Number(rows[0]?.n ?? 0);
}

export async function readFolios(sql: SqlClient): Promise<FolioAggregate[]> {
  const rows = await sql.unsafe(
    `select organization_id::text as org_id,
            extract(year from issue_date)::int as year,
            count(*)::int as documents,
            coalesce(max(nullif(regexp_replace(coalesce(folio, '0'), '\\D', '', 'g'), ''))::bigint, 0) as last_folio
       from public.invoices
      where organization_id is not null and issue_date is not null
      group by 1, 2
      order by 1, 2`,
  );
  const labels = buildOrgLabels(rows.map((r) => String(r.org_id)));
  return rows.map((r) => ({
    org: labelFor(labels, String(r.org_id)),
    year: Number(r.year),
    documents: Number(r.documents),
    lastFolio: Number(r.last_folio ?? 0),
  }));
}

export async function readStorage(sql: SqlClient): Promise<StorageAggregate[]> {
  const objects = await sql.unsafe(
    `select bucket_id::text as bucket, count(*)::int as n
       from storage.objects group by 1 order by 1`,
  );
  const refs = await sql.unsafe(
    `select coalesce(bucket, 'documents')::text as bucket, count(*)::int as n
       from public.documents group by 1`,
  );
  const refMap = new Map<string, number>(refs.map((r) => [String(r.bucket), Number(r.n)]));
  return objects.map((o) => ({
    bucket: String(o.bucket),
    objects: Number(o.n),
    referencedRows: refMap.get(String(o.bucket)) ?? 0,
  }));
}
