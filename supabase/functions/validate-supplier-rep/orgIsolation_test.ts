// Multiempresa (P1): validate-supplier-rep corre con service_role, así que el
// aislamiento vive en el código. Pruebas OFFLINE (sin red ni base de datos).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import {
  handleValidateSupplierRep,
  type ValidateSupplierRepDeps,
} from "./handler.ts";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PAYMENT = "11111111-1111-1111-1111-111111111111";
const BILL = "22222222-2222-2222-2222-222222222222";
const BILL_UUID = "33333333-3333-3333-3333-333333333333";
const REP_UUID = "44444444-4444-4444-4444-444444444444";
const USER = "55555555-5555-5555-5555-555555555555";

const XML =
  `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante TipoDeComprobante="P"><cfdi:Emisor Rfc="AAA010101AAA"/><cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${REP_UUID}"/><pago20:Pagos><pago20:Pago Monto="100.00"><pago20:DoctoRelacionado IdDocumento="${BILL_UUID}"/></pago20:Pago></pago20:Pagos></cfdi:Complemento></cfdi:Comprobante>`;

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function makeReq(paymentId = PAYMENT): Request {
  return new Request("https://example.com/validate-supplier-rep", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payment_id: paymentId,
      xml_base64: b64(XML),
      // Un body malicioso no puede imponer empresa: el handler la ignora.
      organization_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    }),
  });
}

function deps(mock: ReturnType<typeof buildSupabaseMock>): ValidateSupplierRepDeps {
  return {
    authenticate: () =>
      Promise.resolve({
        ok: true as const,
        userId: USER,
        adminClient: mock.client,
      }),
    enforceRateLimit: () => Promise.resolve(null),
  };
}

const membership = {
  data: [{ organization_id: ORG_A, member_type: "internal" }],
  error: null,
};

const paymentRow = {
  id: PAYMENT,
  bill_id: BILL,
  organization_id: ORG_A,
  amount: 100,
  rep_status: null,
  rep_required: true,
  rep_cfdi_uuid: null,
};

const billRow = {
  id: BILL,
  organization_id: ORG_A,
  cfdi_uuid: BILL_UUID,
  suppliers: { rfc: "AAA010101AAA", name: "Proveedor" },
};

Deno.test("rep: un pago de otra empresa responde 404 sin subir archivos ni actualizar", async () => {
  const mock = buildSupabaseMock({
    selects: {
      organization_memberships: membership,
      // Filtrado por empresa: el pago ajeno no existe para este caller.
      supplier_payments: { data: null, error: null },
    },
  });

  const res = await handleValidateSupplierRep(makeReq(), deps(mock));

  assertEquals(res.status, 404);
  assertEquals(mock.uploads.length, 0);
  assertEquals(mock.updates.length, 0);
  assertEquals(mock.inserts.length, 0);
});

Deno.test("rep: un UUID REP de otra empresa no bloquea el pago propio", async () => {
  const mock = buildSupabaseMock({
    selects: { organization_memberships: membership, supplier_bills: { data: billRow, error: null } },
    selectsByFilter: {
      supplier_payments: (filters) => {
        const byUuid = filters.some((f) => f.col === "rep_cfdi_uuid");
        const org = filters.find((f) => f.col === "organization_id")?.val;
        if (!byUuid) return { data: paymentRow, error: null };
        // El duplicado sólo existiría en otra empresa; con el filtro correcto
        // la consulta no devuelve nada.
        return { data: org === ORG_A ? null : { id: "ajeno" }, error: null };
      },
    },
  });

  const res = await handleValidateSupplierRep(makeReq(), deps(mock));

  assertEquals(res.status, 200);
  const upd = mock.updates.find((u) => u.table === "supplier_payments");
  assertEquals(
    upd?.filters.some((f) => f.col === "organization_id" && f.val === ORG_A),
    true,
  );
  // La bitácora lleva empresa explícita.
  const act = mock.inserts.find((i) => i.table === "activity_feed");
  assertEquals(
    (act?.row as { organization_id?: string })?.organization_id,
    ORG_A,
  );
  // La ruta de Storage deriva de la empresa de la factura.
  assertEquals(mock.uploads[0]?.path.startsWith(`${ORG_A}/`), true);
});

Deno.test("rep: la búsqueda de duplicado incluye el filtro de empresa", async () => {
  const seen: Array<Array<{ col: string; val: unknown }>> = [];
  const mock = buildSupabaseMock({
    selects: { organization_memberships: membership, supplier_bills: { data: billRow, error: null } },
    selectsByFilter: {
      supplier_payments: (filters) => {
        seen.push(filters);
        const byUuid = filters.some((f) => f.col === "rep_cfdi_uuid");
        return { data: byUuid ? null : paymentRow, error: null };
      },
    },
  });

  await handleValidateSupplierRep(makeReq(), deps(mock));

  const dupFilters = seen.find((f) => f.some((x) => x.col === "rep_cfdi_uuid"));
  assertEquals(
    dupFilters?.some((f) => f.col === "organization_id" && f.val === ORG_A),
    true,
  );
});

Deno.test("rep: sin membresía interna falla cerrado antes de leer el pago", async () => {
  const mock = buildSupabaseMock({
    selects: { organization_memberships: { data: [], error: null } },
  });

  const res = await handleValidateSupplierRep(makeReq(), deps(mock));

  assertEquals(res.status, 403);
  assertEquals(mock.uploads.length, 0);
  assertEquals(mock.updates.length, 0);
});
