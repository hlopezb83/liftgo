// Unit tests for download-cfdi pure handler.
// Foco: aislamiento multiempresa (Fase 1) — la organización del documento
// se verifica ANTES de leer secretos, llamar al PAC o servir/descargar
// archivos de Storage.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type DownloadCfdiDeps,
  type DownloadSupabaseLike,
  handleDownloadCfdi,
} from "./handler.ts";
import {
  buildSupabaseMock,
  type MockConfig,
} from "../_shared/test/supabaseClientMock.ts";
import type { SupabaseLike } from "../_shared/types.ts";

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ORG_ID = "44444444-4444-4444-8444-444444444444";

function makeRequest(body: unknown, opts: { auth?: string | null } = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Origin": "http://localhost:8080",
  };
  if (opts.auth !== null) headers["Authorization"] = opts.auth ?? "Bearer t";
  return new Request("https://example.com/download-cfdi", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// download-cfdi necesita `storage.download` además de `upload`. Envolvemos el
// mock compartido (que sólo modela `upload`) para exponer el contrato de
// DownloadSupabaseLike sin duplicar la lógica de selects/updates/uploads.
function wrapWithDownload(
  base: SupabaseLike,
  downloadResult: { data: Blob | null; error: unknown },
  onDownload?: () => void,
): DownloadSupabaseLike {
  return {
    ...base,
    storage: {
      from: (bucket: string) => ({
        upload: base.storage.from(bucket).upload,
        download: (_path: string) => {
          onDownload?.();
          return Promise.resolve(downloadResult);
        },
      }),
    },
  } as DownloadSupabaseLike;
}

function makeDeps(opts: {
  service?: MockConfig;
  download?: { data: Blob | null; error: unknown };
  onDownload?: () => void;
  onFacturapiFetch?: () => void;
  fetchImpl?: typeof fetch;
}) {
  const caller = buildSupabaseMock({ claims: { sub: USER_ID } });
  const service = buildSupabaseMock({
    ...(opts.service ?? {}),
    selects: {
      profiles: { data: { is_active: true }, error: null },
      user_roles: { data: { role: "admin" }, error: null },
      organization_memberships: {
        data: [{ organization_id: ORG_ID, member_type: "internal" }],
        error: null,
      },
      organizations: { data: [{ id: ORG_ID }], error: null },
      ...(opts.service?.selects ?? {}),
    },
  });
  const downloadClient = wrapWithDownload(
    service.client,
    opts.download ?? { data: null, error: null },
    opts.onDownload,
  );
  const fetchImpl = opts.onFacturapiFetch
    ? ((...args: Parameters<typeof fetch>) => {
      opts.onFacturapiFetch!();
      return (opts.fetchImpl ?? globalThis.fetch)(...args);
    }) as typeof fetch
    : (opts.fetchImpl ?? globalThis.fetch);
  const deps: DownloadCfdiDeps = {
    createCallerClient: () => caller.client,
    createServiceClient: () => downloadClient,
    fetchImpl,
    env: () => undefined,
  };
  return { deps, serviceState: service };
}

Deno.test("download-cfdi: MULTIEMPRESA rechaza factura de otra organización sin descargar ni leer secretos ajenos", async () => {
  let facturapiCalled = 0;
  let storageDownloadCalled = 0;
  const { deps, serviceState } = makeDeps({
    onFacturapiFetch: () => facturapiCalled++,
    onDownload: () => storageDownloadCalled++,
    service: {
      selects: {
        invoices: {
          data: {
            id: INVOICE_ID,
            organization_id: OTHER_ORG_ID,
            customer_id: null,
            invoice_number: "F-1",
            cfdi_uuid: "uuid-1",
            cfdi_status: "stamped",
            cancellation_status: null,
            cfdi_xml: null,
            cfdi_xml_url: "some/path.xml",
            cfdi_xml_pending: false,
            cfdi_pdf_url: null,
            acuse_pdf_url: null,
            acuse_xml_url: null,
            facturapi_invoice_id: "fapi_other",
          },
          error: null,
        },
        // Si el handler leyera secretos de la organización equivocada, esto
        // los expondría — no debe llegar a consultarse.
        company_settings: { data: { facturapi_mode: "live" }, error: null },
        billing_secrets: {
          data: {
            facturapi_test_key: "sk_ajena_test",
            facturapi_live_key: "sk_ajena_live",
          },
          error: null,
        },
      },
    },
  });
  const res = await handleDownloadCfdi(
    makeRequest({ invoice_id: INVOICE_ID, format: "xml" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 403);
  assertEquals(body.error, "El documento pertenece a otra empresa.");
  assertEquals(facturapiCalled, 0, "el PAC nunca debe invocarse");
  assertEquals(
    storageDownloadCalled,
    0,
    "no debe descargarse el archivo de Storage",
  );
  assertEquals(serviceState.updates.length, 0, "no debe tocarse el documento");
});

Deno.test("download-cfdi: organización sin credenciales propias devuelve error explícito (no usa llaves ajenas)", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        invoices: {
          data: {
            id: INVOICE_ID,
            organization_id: ORG_ID,
            customer_id: null,
            invoice_number: "F-2",
            cfdi_uuid: "uuid-2",
            cfdi_status: "stamped",
            cancellation_status: null,
            cfdi_xml: null,
            cfdi_xml_url: null,
            cfdi_xml_pending: false,
            cfdi_pdf_url: null,
            acuse_pdf_url: null,
            acuse_xml_url: null,
            facturapi_invoice_id: "fapi_2",
          },
          error: null,
        },
        company_settings: {
          data: { facturapi_mode: "live", organization_id: ORG_ID },
          error: null,
        },
        billing_secrets: { data: null, error: null },
        // Existe más de una organización: se desactiva el fallback a llaves
        // globales de entorno (compat legado de una sola empresa).
        organizations: {
          data: [{ id: ORG_ID }, { id: OTHER_ORG_ID }],
          error: null,
        },
      },
    },
  });
  const res = await handleDownloadCfdi(
    makeRequest({ invoice_id: INVOICE_ID, format: "xml" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 500);
  assertEquals(body.error, "Facturapi key not configured");
});

Deno.test("download-cfdi: flujo de una sola empresa sirve el XML ya persistido en Storage", async () => {
  const xmlBlob = new Blob(["<xml/>"], { type: "application/xml" });
  let storageDownloadCalled = 0;
  const { deps } = makeDeps({
    download: { data: xmlBlob, error: null },
    onDownload: () => storageDownloadCalled++,
    service: {
      selects: {
        invoices: {
          data: {
            id: INVOICE_ID,
            organization_id: ORG_ID,
            customer_id: null,
            invoice_number: "F-3",
            cfdi_uuid: "uuid-3",
            cfdi_status: "stamped",
            cancellation_status: null,
            cfdi_xml: null,
            cfdi_xml_url: "org/f3.xml",
            cfdi_xml_pending: false,
            cfdi_pdf_url: null,
            acuse_pdf_url: null,
            acuse_xml_url: null,
            facturapi_invoice_id: "fapi_3",
          },
          error: null,
        },
      },
    },
  });
  const res = await handleDownloadCfdi(
    makeRequest({ invoice_id: INVOICE_ID, format: "xml" }),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(storageDownloadCalled, 1);
  const text = await res.text();
  assertEquals(text, "<xml/>");
  assertEquals(
    res.headers.get("Content-Disposition"),
    'attachment; filename="F-3.xml"',
  );
});

Deno.test("download-cfdi: 401 sin Authorization", async () => {
  const { deps } = makeDeps({});
  const res = await handleDownloadCfdi(
    makeRequest({ invoice_id: INVOICE_ID, format: "xml" }, { auth: null }),
    deps,
  );
  assertEquals(res.status, 401);
});

Deno.test("download-cfdi: 404 si la factura no existe", async () => {
  const { deps } = makeDeps({
    service: { selects: { invoices: { data: null, error: null } } },
  });
  const res = await handleDownloadCfdi(
    makeRequest({ invoice_id: INVOICE_ID, format: "xml" }),
    deps,
  );
  assertEquals(res.status, 404);
});

// ---------------------------------------------------------------------------
// 8.8.7 · Portal de clientes. Un cliente del portal NO tiene membresía
// interna: su empresa y su cliente salen de `customer_portal_accounts`
// activa + membresía 'portal'. Los fixtures respetan los filtros reales
// (status y member_type) para que no se cuele una membresía interna.
// ---------------------------------------------------------------------------

const PORTAL_USER = "55555555-5555-4555-8555-555555555555";
const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";
const OTHER_CUSTOMER_ID = "77777777-7777-4777-8777-777777777777";
const PAYMENT_ID = "88888888-8888-4888-8888-888888888888";

type Filters = Array<{ col: string; val: unknown }>;
const filterVal = (filters: Filters, col: string) =>
  filters.find((f) => f.col === col)?.val;

function portalFixtures(opts: {
  accountStatus?: string;
  accountOrg?: string;
  accountCustomer?: string;
  membershipOrg?: string;
  membershipType?: string;
  accountError?: unknown;
  membershipError?: unknown;
  /** Usuario dueño de la cuenta/membresía; por defecto el del JWT. */
  ownerUserId?: string;
}) {
  const {
    accountStatus = "active",
    accountOrg = ORG_ID,
    accountCustomer = CUSTOMER_ID,
    membershipOrg = ORG_ID,
    membershipType = "portal",
    ownerUserId = PORTAL_USER,
  } = opts;
  // Los fixtures respetan los filtros REALES de la consulta (auth_user_id,
  // status y member_type): así ninguna fila "se cuela" cuando el handler
  // pregunta por otra identidad, otro estado u otro tipo de membresía.
  const matchesUser = (filters: Filters) => {
    const wanted = filterVal(filters, "auth_user_id");
    return wanted === undefined || wanted === ownerUserId;
  };
  return {
    customer_portal_accounts: (filters: Filters) => {
      if (opts.accountError) {
        return { data: null, error: opts.accountError };
      }
      if (!matchesUser(filters)) return { data: [], error: null };
      // La consulta real filtra por status='active': una cuenta suspendida
      // o revocada NO debe devolverse.
      const wanted = filterVal(filters, "status");
      if (wanted !== undefined && wanted !== accountStatus) {
        return { data: [], error: null };
      }
      return {
        data: [{
          organization_id: accountOrg,
          customer_id: accountCustomer,
          status: accountStatus,
        }],
        error: null,
      };
    },
    organization_memberships: (filters: Filters) => {
      if (opts.membershipError) {
        return { data: null, error: opts.membershipError };
      }
      if (!matchesUser(filters)) return { data: [], error: null };
      const wanted = filterVal(filters, "member_type");
      if (wanted !== undefined && wanted !== membershipType) {
        return { data: [], error: null };
      }
      return {
        data: [{
          organization_id: membershipOrg,
          member_type: membershipType,
        }],
        error: null,
      };
    },
  };
}

function makePortalDeps(opts: {
  portal: Parameters<typeof portalFixtures>[0];
  selects?: MockConfig["selects"];
  download?: { data: Blob | null; error: unknown };
  onDownload?: () => void;
  onFacturapiFetch?: () => void;
}) {
  const caller = buildSupabaseMock({ claims: { sub: PORTAL_USER } });
  const service = buildSupabaseMock({
    selects: {
      profiles: { data: { is_active: true }, error: null },
      user_roles: { data: { role: "customer" }, error: null },
      organizations: {
        data: [{ id: ORG_ID }, { id: OTHER_ORG_ID }],
        error: null,
      },
      ...(opts.selects ?? {}),
    },
    selectsByFilter: portalFixtures(opts.portal),
  });
  const downloadClient = wrapWithDownload(
    service.client,
    opts.download ?? { data: null, error: null },
    opts.onDownload,
  );
  const fetchImpl = ((..._args: Parameters<typeof fetch>) => {
    opts.onFacturapiFetch?.();
    // Sin red: cualquier llamada al PAC en estas pruebas es un error.
    return Promise.reject(new Error("PAC no debe invocarse en estas pruebas"));
  }) as unknown as typeof fetch;
  const deps: DownloadCfdiDeps = {
    createCallerClient: () => caller.client,
    createServiceClient: () => downloadClient,
    fetchImpl,
    env: () => undefined,
  };
  return { deps, serviceState: service };
}

const invoiceRow = (over: Record<string, unknown> = {}) => ({
  id: INVOICE_ID,
  organization_id: ORG_ID,
  customer_id: CUSTOMER_ID,
  invoice_number: "F-P1",
  cfdi_uuid: "uuid-p1",
  cfdi_status: "stamped",
  cancellation_status: null,
  cfdi_xml: null,
  cfdi_xml_url: "org/p1.xml",
  cfdi_xml_pending: false,
  cfdi_pdf_url: null,
  acuse_pdf_url: null,
  acuse_xml_url: null,
  facturapi_invoice_id: "fapi_p1",
  ...over,
});

Deno.test("portal: cliente con cuenta activa descarga su propio CFDI", async () => {
  let pac = 0;
  const { deps } = makePortalDeps({
    portal: {},
    download: {
      data: new Blob(["<xml/>"], { type: "application/xml" }),
      error: null,
    },
    onFacturapiFetch: () => pac++,
    selects: { invoices: { data: invoiceRow(), error: null } },
  });
  const res = await handleDownloadCfdi(
    makeRequest({ invoice_id: INVOICE_ID, format: "xml" }),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "<xml/>");
  assertEquals(pac, 0);
});

Deno.test("portal: documento de OTRA empresa se rechaza sin PAC ni Storage", async () => {
  let pac = 0, dl = 0;
  const { deps, serviceState } = makePortalDeps({
    portal: {},
    onFacturapiFetch: () => pac++,
    onDownload: () => dl++,
    selects: {
      invoices: {
        data: invoiceRow({ organization_id: OTHER_ORG_ID }),
        error: null,
      },
    },
  });
  const res = await handleDownloadCfdi(
    makeRequest({ invoice_id: INVOICE_ID, format: "xml" }),
    deps,
  );
  assertEquals(res.status, 403);
  assertEquals(pac, 0);
  assertEquals(dl, 0);
  assertEquals(serviceState.updates.length, 0);
});

Deno.test("portal: documento de OTRO cliente de la misma empresa se rechaza", async () => {
  let dl = 0;
  const { deps } = makePortalDeps({
    portal: {},
    onDownload: () => dl++,
    selects: {
      invoices: {
        data: invoiceRow({ customer_id: OTHER_CUSTOMER_ID }),
        error: null,
      },
    },
  });
  const res = await handleDownloadCfdi(
    makeRequest({ invoice_id: INVOICE_ID, format: "xml" }),
    deps,
  );
  assertEquals(res.status, 403);
  assertEquals(dl, 0);
});

Deno.test("portal: cuenta suspendida/revocada no obtiene archivos", async () => {
  let dl = 0;
  const { deps } = makePortalDeps({
    portal: { accountStatus: "suspended" },
    onDownload: () => dl++,
    selects: { invoices: { data: invoiceRow(), error: null } },
  });
  const res = await handleDownloadCfdi(
    makeRequest({ invoice_id: INVOICE_ID, format: "xml" }),
    deps,
  );
  assertEquals(res.status, 403);
  assertEquals(dl, 0);
});

Deno.test("portal: membresía interna NO habilita la ruta de portal", async () => {
  const { deps } = makePortalDeps({
    portal: { membershipType: "internal" },
    selects: { invoices: { data: invoiceRow(), error: null } },
  });
  const res = await handleDownloadCfdi(
    makeRequest({ invoice_id: INVOICE_ID, format: "xml" }),
    deps,
  );
  assertEquals(res.status, 403);
});

Deno.test("portal: error al verificar la membresía responde 503 sin servir archivos", async () => {
  let dl = 0;
  const { deps } = makePortalDeps({
    portal: { membershipError: { message: "db down" } },
    onDownload: () => dl++,
    selects: { invoices: { data: invoiceRow(), error: null } },
  });
  const res = await handleDownloadCfdi(
    makeRequest({ invoice_id: INVOICE_ID, format: "xml" }),
    deps,
  );
  assertEquals(res.status, 503);
  assertEquals(dl, 0);
});

Deno.test("portal: REP cuya factura relacionada es de otra empresa se bloquea", async () => {
  let dl = 0;
  const { deps } = makePortalDeps({
    portal: {},
    onDownload: () => dl++,
    selects: {
      payments: {
        data: {
          organization_id: ORG_ID,
          invoice_id: INVOICE_ID,
          rep_facturapi_id: "fapi_rep",
          rep_cfdi_uuid: "uuid-rep",
          rep_cfdi_status: "stamped",
          rep_xml_url: "org/rep.xml",
          rep_pdf_url: null,
        },
        error: null,
      },
      invoices: {
        data: {
          customer_id: CUSTOMER_ID,
          organization_id: OTHER_ORG_ID,
        },
        error: null,
      },
    },
  });
  const res = await handleDownloadCfdi(
    makeRequest({ payment_id: PAYMENT_ID, format: "xml" }),
    deps,
  );
  assertEquals(res.status, 403);
  assertEquals(dl, 0);
});
