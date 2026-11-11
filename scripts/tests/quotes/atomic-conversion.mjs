import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

// Run inside the disposable cluster owned by invoice-booking-reads.postgres.mjs.
export async function checkAtomicQuoteConversion(sql, { org, foreignOrg, actor, unit, session }) {
  await sql.unsafe(source("./atomic-conversion.fixture.sql"));
  const reassignment = source("../../../supabase/migrations/20260831001450_58adf7be-ffb3-45a9-9724-fa9ddec24c9d.sql")
    .match(/CREATE OR REPLACE FUNCTION public\.reassign_quote_customer\([\s\S]*?\$fn\$;/)?.[0];
  assert.ok(reassignment, "load the real reassignment procedure");
  await sql.unsafe(reassignment.replace("SECURITY DEFINER", "SECURITY INVOKER"));
  await sql`GRANT EXECUTE ON FUNCTION public.reassign_quote_customer(uuid,uuid,text) TO authenticated`;
  await sql.unsafe(source("../../../drizzle/migrations/0137_atomic_quote_conversion.sql"));

  const quote = "13700000-0000-4000-8000-000000000001";
  const customer = "13700000-0000-4000-8000-000000000002";
  const foreignCustomer = "13700000-0000-4000-8000-000000000003";
  await sql`INSERT INTO customers(id,name) VALUES (${customer},'Cliente real del fixture'),(${foreignCustomer},'Cliente ajeno')`;
  await sql`INSERT INTO organization_customers(organization_id,customer_id,status,alias)
    VALUES (${org},${customer},'active','Nombre local'),(${foreignOrg},${foreignCustomer},'active','Cliente ajeno')`;
  await sql`INSERT INTO quotes(id,organization_id,quote_number,status,customer_name,start_date,end_date)
    VALUES (${quote},${org},'QA-ATOMIC','accepted','Público en General','2026-04-01','2026-04-15')`;

  await session(actor);
  const convert = (id, assignments) => sql`SELECT * FROM public.convert_quote_with_customer_scoped(
    ${quote}::uuid,${sql.json(assignments)}::jsonb,false,${id}::uuid)`;
  await assert.rejects(convert(foreignCustomer, [{ forklift_id: unit }]), { code: "23514" });
  await assert.rejects(convert(customer, []), { code: "23514" });
  assert.deepEqual([...(await sql`SELECT customer_id,customer_name FROM quotes WHERE id=${quote}`)], [
    { customer_id: null, customer_name: "Público en General" },
  ]);

  const [booking] = await convert(customer, [{ forklift_id: unit }]);
  assert.ok(booking.booking_id);
  assert.equal(booking.forklift_id, unit);
  assert.equal(booking.customer_id, customer);
  assert.deepEqual([...(await sql`SELECT customer_id,customer_name FROM quotes WHERE id=${quote}`)], [
    { customer_id: customer, customer_name: "Nombre local" },
  ]);
  await assert.rejects(convert(foreignCustomer, [{ forklift_id: unit }]), { code: "23514" });
  await sql`RESET ROLE`;
  const [acl] = await sql`SELECT has_function_privilege('anon', oid, 'EXECUTE') AS anon,
    has_function_privilege('service_role', oid, 'EXECUTE') AS service,
    prosecdef FROM pg_proc WHERE proname = 'convert_quote_with_customer_scoped'`;
  assert.deepEqual(acl, { anon: false, service: false, prosecdef: false });
  console.log("Atomic quote conversion passed: committed customer, rollback, tenant and invoker grants.");
}
