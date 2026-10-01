import { describe, expect, it } from "vitest";
import {
  platformAuditInputSchema,
  platformAuditPageSchema,
} from "@/lib/platformAudit.types";
import { platformOrganizationDetailSchema } from "@/lib/platformOrganizationDetail.types";
import {
  organizationStatusReasonSchema,
  platformOrganizationStatusInputSchema,
} from "@/lib/platformOrganizationStatus.types";
import { organizationReadiness } from "../lib/organizationReadiness";
import { auditEvent, organizationDetail, ORG_ID } from "./readModels.fixture";

describe("proyecciones administrativas de plataforma", () => {
  it("descarta secretos y datos operativos aunque el RPC los agregue por error", () => {
    const detail = organizationDetail();
    const parsed = platformOrganizationDetailSchema.parse({
      ...detail,
      bank_accounts: [{ clabe: "NO_EXPOSURE" }],
      billing: { ...detail.billing, facturapi_test_key: "NO_EXPOSURE" },
      settings: { ...detail.settings, facturapi_live_key: "NO_EXPOSURE" },
      administrators: [
        { ...detail.administrators[0], password: "NO_EXPOSURE" },
      ],
    });
    expect(JSON.stringify(parsed)).not.toContain("NO_EXPOSURE");
    const event = auditEvent();
    const page = platformAuditPageSchema.parse({
      events: [
        {
          ...event,
          new_state: {
            is_active: true,
            content: { password: "NO_EXPOSURE" },
            specifications: "NO_EXPOSURE",
            facturapi_test_key: "NO_EXPOSURE",
          },
        },
      ],
      has_more: false,
    });
    expect(page.events[0].id).toBe("9007199254740993");
    expect(page.events[0].new_state).toEqual({ is_active: true });
  });

  it.each(["", "0", "-1", "abc", "1.5", "9223372036854775808", "1e3"])(
    "rechaza cursor inválido %s sin lanzar una excepción de BigInt",
    (before_id) => {
      expect(platformAuditInputSchema.safeParse({ before_id }).success).toBe(
        false,
      );
    },
  );
  it("admite el rango de bigint como texto y rechaza filtros desconocidos", () => {
    expect(
      platformAuditInputSchema.parse({ before_id: "9223372036854775807" })
        .before_id,
    ).toBe("9223372036854775807");
    expect(
      platformAuditInputSchema.safeParse({ organization_id: "all" }).success,
    ).toBe(false);
    expect(
      platformAuditInputSchema.safeParse({ target_type: "billing_secrets" })
        .success,
    ).toBe(false);
    expect(platformAuditInputSchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
  });
  it.each([
    "sk_test_a",
    "sk_live_b",
    "Bearer NOTAREALTOKEN",
    "eyJabcdefghijk.NOTAREALTOKEN",
  ])("rechaza credenciales reconocibles en motivos", (reason) => {
    expect(organizationStatusReasonSchema.safeParse(reason).success).toBe(
      false,
    );
  });
  it("exige motivo y conserva el texto recortado", () => {
    expect(
      platformOrganizationStatusInputSchema.safeParse({
        organization_id: ORG_ID,
        active: false,
      }).success,
    ).toBe(false);
    expect(
      organizationStatusReasonSchema.parse("  Solicitud administrativa  "),
    ).toBe("Solicitud administrativa");
    expect(organizationStatusReasonSchema.safeParse("    ").success).toBe(
      false,
    );
    expect(
      organizationStatusReasonSchema.safeParse("x".repeat(501)).success,
    ).toBe(false);
  });
});

describe("checklist de incorporación", () => {
  it("permite inicialización perezosa y versión anterior, y distingue recomendaciones", () => {
    const items = organizationReadiness(organizationDetail());
    expect(
      items.filter((item) => item.required).every((item) => item.ready),
    ).toBe(true);
    expect(
      items.filter((item) => !item.required).every((item) => !item.ready),
    ).toBe(true);
    expect(items.find((item) => item.id === "billing")?.description).toContain(
      "no se consulta al proveedor",
    );
  });
  it("no da por válida una configuración duplicada, admin inactivo o catálogo no adoptado", () => {
    const detail = organizationDetail();
    detail.settings.records = 2;
    detail.administrators[0].is_active = false;
    detail.catalogs.global_models_enabled = 0;
    detail.templates.push({
      ...detail.templates[0],
      definition_id: detail.administrators[0].user_id,
    });
    const missing = organizationReadiness(detail)
      .filter((item) => !item.ready)
      .map((item) => item.id);
    expect(missing).toEqual(
      expect.arrayContaining(["admin", "fiscal", "models", "templates"]),
    );
  });
  it("rechaza RFC, régimen o CP incompletos y contadores no positivos", () => {
    const detail = organizationDetail();
    detail.settings.rfc = "INVALIDO";
    detail.settings.regimen_fiscal = "60";
    detail.settings.postal_code = "6400";
    detail.billing.key_configured = false;
    detail.counters = [{ document_type: "quote", next_value: "0" }];
    expect(
      organizationReadiness(detail)
        .filter((item) => item.required && !item.ready)
        .map((item) => item.id),
    ).toEqual(["fiscal", "billing", "folios"]);
  });
});
