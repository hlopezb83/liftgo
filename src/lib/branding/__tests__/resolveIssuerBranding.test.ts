import { describe, expect, it } from "vitest";
import {
  IssuerBrandingError,
  resolveIssuerBranding,
  type IssuerBrandingClient,
} from "../resolveIssuerBranding";
import type { OrganizationContextResult } from "@/lib/organization/resolveOrganizationContext";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const CUSTOMER = "33333333-3333-3333-3333-333333333333";
const INVOICE = "44444444-4444-4444-4444-444444444444";

type Row = Record<string, unknown>;
type TableData = { rows?: Row[]; error?: { message: string } };

function makeClient(tables: Record<string, TableData>): IssuerBrandingClient {
  return {
    from(table: string) {
      const entry = tables[table] ?? { rows: [] };
      return {
        select: () => ({
          eq: (column: string, value: string) => ({
            limit: () =>
              Promise.resolve(
                entry.error
                  ? { data: null, error: entry.error }
                  : {
                    data: (entry.rows ?? []).filter((r) => r[column] === value),
                    error: null,
                  },
              ),
          }),
        }),
      };
    },
  };
}

const internalA: OrganizationContextResult = {
  status: "ready",
  organizationId: ORG_A,
  memberType: "internal",
  customerId: null,
};

const portalA: OrganizationContextResult = {
  status: "ready",
  organizationId: ORG_A,
  memberType: "portal",
  customerId: CUSTOMER,
};

const settingsA = {
  organization_id: ORG_A,
  razon_social: "Empresa A",
  rfc: "AAA010101AAA",
  regimen_fiscal: "601",
  lugar_expedicion: "64000",
  logo_url: "logo-a.png",
  facturapi_mode: "live",
};

const settingsB = { ...settingsA, organization_id: ORG_B, razon_social: "Empresa B", rfc: "BBB010101BBB" };

describe("resolveIssuerBranding · cliente", () => {
  // `customers` no tiene `organization_id`: el vínculo vive en la tabla puente.
  it("resuelve el emisor de un cliente vía organization_customers", async () => {
    const client = makeClient({
      organization_customers: {
        rows: [{ customer_id: CUSTOMER, organization_id: ORG_A }],
      },
      customers: { error: { message: "column customers.organization_id does not exist" } },
      company_settings: { rows: [settingsA, settingsB] },
    });
    const result = await resolveIssuerBranding(client, portalA, { type: "customer", id: CUSTOMER });
    expect(result).toEqual({
      status: "ready",
      branding: { ...settingsA, organizationId: ORG_A },
    });
  });

  it("rechaza un cliente que no pertenece a la empresa verificada", async () => {
    const client = makeClient({
      organization_customers: {
        rows: [{ customer_id: CUSTOMER, organization_id: ORG_B }],
      },
      company_settings: { rows: [settingsA] },
    });
    const result = await resolveIssuerBranding(client, internalA, { type: "customer", id: CUSTOMER });
    expect(result).toEqual({ status: "unavailable", reason: "document_forbidden" });
  });
});

describe("resolveIssuerBranding", () => {
  it("usa los datos de la organización propietaria del documento", async () => {
    const client = makeClient({
      invoices: { rows: [{ id: INVOICE, organization_id: ORG_A, customer_id: CUSTOMER }] },
      company_settings: { rows: [settingsA, settingsB] },
    });
    const result = await resolveIssuerBranding(client, internalA, { type: "invoice", id: INVOICE });
    expect(result).toEqual({
      status: "ready",
      branding: {
        organizationId: ORG_A,
        razon_social: "Empresa A",
        rfc: "AAA010101AAA",
        regimen_fiscal: "601",
        lugar_expedicion: "64000",
        logo_url: "logo-a.png",
        facturapi_mode: "live",
      },
    });
  });

  it("no hereda datos de otra organización cuando el documento es de B", async () => {
    const client = makeClient({
      invoices: { rows: [{ id: INVOICE, organization_id: ORG_B, customer_id: CUSTOMER }] },
      company_settings: { rows: [settingsA, settingsB] },
    });
    const result = await resolveIssuerBranding(client, internalA, { type: "invoice", id: INVOICE });
    expect(result).toEqual({ status: "unavailable", reason: "document_forbidden" });
  });

  it("el portal sólo obtiene emisor de sus propios documentos", async () => {
    const otherCustomer = "55555555-5555-5555-5555-555555555555";
    const client = makeClient({
      invoices: { rows: [{ id: INVOICE, organization_id: ORG_A, customer_id: otherCustomer }] },
      company_settings: { rows: [settingsA] },
    });
    const result = await resolveIssuerBranding(client, portalA, { type: "invoice", id: INVOICE });
    expect(result).toEqual({ status: "unavailable", reason: "document_forbidden" });
  });

  it("el portal no puede pedir emisor sin documento", async () => {
    const client = makeClient({ company_settings: { rows: [settingsA] } });
    const result = await resolveIssuerBranding(client, portalA, null);
    expect(result).toEqual({ status: "unavailable", reason: "document_forbidden" });
  });

  it("configuración ausente devuelve estado explícito sin respaldo", async () => {
    const client = makeClient({ company_settings: { rows: [settingsB] } });
    const result = await resolveIssuerBranding(client, internalA, null);
    expect(result).toEqual({ status: "unavailable", reason: "settings_missing" });
  });

  it("configuración duplicada es ambigua", async () => {
    const client = makeClient({ company_settings: { rows: [settingsA, { ...settingsA }] } });
    const result = await resolveIssuerBranding(client, internalA, null);
    expect(result).toEqual({ status: "unavailable", reason: "settings_ambiguous" });
  });

  it("error de lectura se propaga como error explícito", async () => {
    const client = makeClient({ company_settings: { error: { message: "boom" } } });
    await expect(resolveIssuerBranding(client, internalA, null)).rejects.toBeInstanceOf(
      IssuerBrandingError,
    );
  });

  it("sin organización verificada no hay emisor", async () => {
    const client = makeClient({ company_settings: { rows: [settingsA] } });
    const result = await resolveIssuerBranding(
      client,
      { status: "no_membership", reason: "no_membership" },
      null,
    );
    expect(result).toEqual({ status: "unavailable", reason: "no_organization" });
  });

  it("documento inexistente no revela otra empresa", async () => {
    const client = makeClient({
      invoices: { rows: [] },
      company_settings: { rows: [settingsA] },
    });
    const result = await resolveIssuerBranding(client, internalA, { type: "invoice", id: INVOICE });
    expect(result).toEqual({ status: "unavailable", reason: "document_not_found" });
  });
});
