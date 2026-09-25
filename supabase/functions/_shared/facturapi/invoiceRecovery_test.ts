import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyPacInvoice, lookupPacInvoice } from "./invoiceRecovery.ts";

Deno.test("Facturapi 202 pending preserves remote ID without UUID", () => {
  assertEquals(classifyPacInvoice({ id: "pac-1", status: "pending" }), {
    kind: "pending",
    facturapi_id: "pac-1",
  });
  assertEquals(
    classifyPacInvoice({ id: "pac-1", status: "valid", uuid: "sat-1" }),
    {
      kind: "hit",
      facturapi_id: "pac-1",
      uuid: "sat-1",
    },
  );
  assertEquals(classifyPacInvoice({ id: "pac-1", status: "failed" }), {
    kind: "failed",
    facturapi_id: "pac-1",
  });
  assertEquals(classifyPacInvoice({ id: "pac-1", status: "valid" }), {
    kind: "lookup_failed",
  });
});

Deno.test("known ID is retrieved, never mistaken for a list miss", async () => {
  let lists = 0;
  const client = {
    invoices: {
      list: async () => {
        lists++;
        return { data: [] };
      },
      retrieve: async (id: string) => ({
        id,
        external_id: "local-1",
        status: "pending",
      }),
    },
  };
  assertEquals(await lookupPacInvoice(client, "local-1", "pac-1"), {
    kind: "pending",
    facturapi_id: "pac-1",
  });
  assertEquals(lists, 0);
});

Deno.test("exact external ID and ambiguous matches fail closed", async () => {
  const other = {
    id: "pac-other",
    external_id: "other",
    status: "valid",
    uuid: "u",
  };
  const pending = { id: "pac-1", external_id: "local-1", status: "pending" };
  const client = {
    invoices: { list: async () => ({ data: [other, pending] }) },
  };
  assertEquals(await lookupPacInvoice(client, "local-1", null), {
    kind: "pending",
    facturapi_id: "pac-1",
  });
  client.invoices.list = async () => ({
    data: [pending, { ...pending, id: "pac-2" }],
  });
  assertEquals(await lookupPacInvoice(client, "local-1", null), {
    kind: "lookup_failed",
  });
});
