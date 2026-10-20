import postgres from "postgres";

// This is a transport adapter, not a persistence simulator: every predicate,
// affected-row count, race and injected DB error is evaluated by PostgreSQL.
// It implements only the Supabase chain used by the real REP reconciler.
export function createPostgresAdapter(sql: ReturnType<typeof postgres>) {
  const identifier = (value: string) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe fixture identifier: ${value}`);
    return `"${value}"`;
  };
  const hooks = { afterPaymentSnapshot: null as null | (() => Promise<void>) };
  const uploads: string[] = [];
  const admin = {
    storage: { from: () => ({ upload: async (name: string) => { uploads.push(name); return { error: null }; } }) },
    from(table: string) {
      if (!["payments", "invoices", "credit_notes"].includes(table)) throw new Error(`Unexpected fixture table ${table}`);
      let patch: Record<string, unknown> | null = null;
      let columns = "*";
      let maximum: number | null = null;
      let single = false;
      const predicates: Array<[string, string, unknown]> = [];
      let execution: Promise<unknown> | undefined;
      const execute = async () => {
        const values: unknown[] = [];
        const bind = (value: unknown, column: string) => {
          values.push(value);
          const parameter = `$${values.length}`;
          // PostgREST receives timestamp filters as text. Prevent the Node
          // driver's timestamptz serializer from round-tripping through Date.
          return ["updated_at", "rep_stamping_started_at"].includes(column)
            ? `(${parameter}::text)::timestamptz` : parameter;
        };
        const selected = columns === "*" ? "*" : columns.split(",").map((name) => identifier(name.trim())).join(",");
        const assignment = patch ? Object.entries(patch).map(([key, value]) => `${identifier(key)}=${bind(value, key)}`).join(",") : "";
        const where = predicates.map(([column, operator, value]) => {
          if (operator === "IS NULL" || operator === "IS NOT NULL") return `${identifier(column)} ${operator}`;
          return `${identifier(column)} ${operator} ${bind(value, column)}`;
        }).join(" AND ");
        const target = `public.${identifier(table)}`;
        const query = patch
          ? `UPDATE ${target} SET ${assignment}${where ? ` WHERE ${where}` : ""} RETURNING ${selected}`
          : `SELECT ${selected} FROM ${target}${where ? ` WHERE ${where}` : ""}${maximum === null ? "" : ` LIMIT ${maximum}`}`;
        try {
          // Let PostgreSQL serialize JSON like PostgREST. A JS Date would
          // truncate timestamp microseconds and silently weaken the CAS test.
          const serialized = patch
            ? `WITH changed AS (${query}) SELECT row_to_json(changed) AS payload FROM changed`
            : `SELECT row_to_json(selected) AS payload FROM (${query}) selected`;
          const rows = (await sql.unsafe(serialized, values as never[])).map((row) => row.payload);
          if (!patch && table === "payments" && predicates.some(([key, , value]) => key === "rep_cfdi_status" && value === "stamping")) {
            await hooks.afterPaymentSnapshot?.();
          }
          return { data: single ? rows[0] ?? null : rows, error: null };
        } catch (error) {
          return { data: null, error: { message: (error as Error).message } };
        }
      };
      const promise = () => execution ??= execute();
      const chain = {
        select(value: string) { columns = value; return chain; },
        update(value: Record<string, unknown>) { patch = value; return chain; },
        eq(column: string, value: unknown) { predicates.push([column, "=", value]); return chain; },
        lt(column: string, value: unknown) { predicates.push([column, "<", value]); return chain; },
        is(column: string, value: unknown) { if (value !== null) throw new Error("Only IS NULL is supported"); predicates.push([column, "IS NULL", null]); return chain; },
        not(column: string, operator: string, value: unknown) { if (operator !== "is" || value !== null) throw new Error("Only IS NOT NULL is supported"); predicates.push([column, "IS NOT NULL", null]); return chain; },
        limit(value: number) { if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid limit"); maximum = value; return chain; },
        maybeSingle() { single = true; return promise(); },
        then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) { return promise().then(resolve, reject); },
      };
      return chain;
    },
  };
  return { admin, hooks, uploads };
}
