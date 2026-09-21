/**
 * Consultas de solo lectura sobre una copia restaurada.
 * Devuelven exclusivamente agregados numericos o etiquetas enmascaradas.
 */

import { buildOrgLabels, labelFor } from "./masking";
import type { FolioAggregate, LedgerState, StorageAggregate, TableCount } from "./report";

export type SqlClient = {
  // La firma refleja solo la parte de postgres.js que usa este modulo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsafe: (query: string, params?: any[]) => Promise<any[]>;
};

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

export const STORAGE_REFERENCE_SPECS = [
  { table: "documents", column: "file_url", bucket: "documents" },
  { table: "feedback_reports", column: "screenshot_url", bucket: "feedback-screenshots" },
  { table: "customer_payment_intents", column: "proof_url", bucket: "payment-proofs" },
  { table: "invoices", column: "cfdi_xml_url", bucket: "cfdi-files" },
  { table: "invoices", column: "cfdi_pdf_url", bucket: "cfdi-files" },
  { table: "invoices", column: "acuse_xml_url", bucket: "cfdi-files" },
  { table: "invoices", column: "acuse_pdf_url", bucket: "cfdi-files" },
  { table: "credit_notes", column: "cfdi_xml_url", bucket: "cfdi-files" },
  { table: "credit_notes", column: "cfdi_pdf_url", bucket: "cfdi-files" },
  { table: "payments", column: "rep_xml_url", bucket: "cfdi-files" },
  { table: "payments", column: "rep_pdf_url", bucket: "cfdi-files" },
  { table: "supplier_bills", column: "cfdi_xml_url", bucket: "supplier-bill-cfdi-xml" },
  { table: "supplier_payments", column: "receipt_url", bucket: "supplier-payment-receipts" },
  { table: "supplier_payments", column: "rep_xml_url", bucket: "cfdi-files" },
  { table: "supplier_payments", column: "rep_pdf_url", bucket: "cfdi-files" },
] as const;

export const CANONICAL_STORAGE_BUCKETS: string[] = [
  ...new Set(STORAGE_REFERENCE_SPECS.map((spec) => spec.bucket)),
].sort();

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
            extract(year from issued_at)::int as year,
            count(*)::int as documents,
            coalesce(max(nullif(regexp_replace(coalesce(folio, '0'), '\\D', '', 'g'), ''))::bigint, 0) as last_folio
       from public.invoices
      where organization_id is not null and issued_at is not null
      group by 1, 2
      order by 1, 2`,
  );
  const labels = buildOrgLabels(rows.map((row) => String(row.org_id)));
  return rows.map((row) => ({
    org: labelFor(labels, String(row.org_id)),
    year: Number(row.year),
    documents: Number(row.documents),
    lastFolio: Number(row.last_folio ?? 0),
  }));
}

export async function readStorage(sql: SqlClient): Promise<StorageAggregate[]> {
  const objectRows = await sql.unsafe(
    `select bucket_id::text as bucket, count(*)::int as n
       from storage.objects
      group by 1`,
  );
  const canonical = new Set(CANONICAL_STORAGE_BUCKETS);
  const objects = new Map(CANONICAL_STORAGE_BUCKETS.map((bucket) => [bucket, 0]));
  let otherObjects = 0;
  for (const row of objectRows) {
    const bucket = String(row.bucket);
    if (canonical.has(bucket)) objects.set(bucket, Number(row.n));
    else otherObjects += Number(row.n);
  }

  const references = new Map(CANONICAL_STORAGE_BUCKETS.map((bucket) => [bucket, 0]));
  for (const spec of STORAGE_REFERENCE_SPECS) {
    // table/column provienen de la constante cerrada anterior, nunca de input.
    const rows = await sql.unsafe(
      `select count(*)::int as n
         from public.${spec.table}
        where ${spec.column} is not null
          and btrim(${spec.column}::text) <> ''`,
    );
    references.set(spec.bucket, (references.get(spec.bucket) ?? 0) + Number(rows[0]?.n ?? 0));
  }

  return [
    ...CANONICAL_STORAGE_BUCKETS.map((bucket) => ({
      bucket,
      objects: objects.get(bucket) ?? 0,
      referencedRows: references.get(bucket) ?? 0,
    })),
    { bucket: "other", objects: otherObjects, referencedRows: 0 },
  ];
}

