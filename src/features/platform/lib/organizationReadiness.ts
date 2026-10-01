import type { PlatformOrganizationDetail } from "@/lib/platformOrganizationDetail.types";

export interface ReadinessItem {
  id: string;
  label: string;
  ready: boolean;
  required: boolean;
  description: string;
}

/** Indicadores de configuración observada, nunca un certificado fiscal o de operación. */
export function organizationReadiness(
  detail: PlatformOrganizationDetail,
): ReadinessItem[] {
  const { settings, billing, catalogs } = detail;
  const fiscal =
    settings.records === 1 &&
    !!settings.razon_social?.trim() &&
    /^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/.test(
      settings.rfc?.trim().toUpperCase() ?? "",
    ) &&
    /^\d{3}$/.test(settings.regimen_fiscal ?? "") &&
    /^\d{5}$/.test(settings.postal_code ?? "");
  const rentalTemplates = detail.templates.filter(
    (template) =>
      template.is_active && template.document_type === "rental_contract",
  );
  return [
    {
      id: "admin",
      label: "Administrador activo",
      required: true,
      ready: detail.administrators.some((admin) => admin.is_active),
      description:
        "Al menos un administrador interno con cuenta activa. La suspensión de la empresa bloquea su acceso.",
    },
    {
      id: "fiscal",
      label: "Datos fiscales completos",
      required: true,
      ready: fiscal,
      description:
        settings.records > 1
          ? "Hay configuraciones duplicadas; deben resolverse desde el ERP de la empresa."
          : "Razón social, RFC, régimen y código postal con formato válido. No implica validación ante el SAT.",
    },
    {
      id: "billing",
      label: "Facturación configurada",
      required: true,
      ready: billing.key_configured,
      description: billing.mode
        ? `Ambiente ${billing.mode === "test" ? "de pruebas" : "de producción"}. Disponibilidad de llave; no se consulta al proveedor.`
        : "La empresa debe seleccionar su ambiente y configurar su propia llave.",
    },
    {
      id: "models",
      label: "Modelos LiftGo habilitados",
      required: true,
      ready: catalogs.global_models_enabled > 0,
      description: `${catalogs.global_models_enabled} modelos globales activos habilitados. Las tarifas se administran por empresa.`,
    },
    {
      id: "templates",
      label: "Machote de contrato asignado",
      required: true,
      ready: rentalTemplates.length === 1,
      description:
        rentalTemplates.length > 1
          ? "Hay más de una asignación activa para contratos; debe quedar una sola."
          : "Una versión activa asignada a la empresa. Una versión anterior puede seguir siendo válida.",
    },
    {
      id: "folios",
      label: "Folios locales independientes",
      required: true,
      ready: detail.counters.every((counter) =>
        /^[1-9]\d*$/.test(counter.next_value),
      ),
      description:
        "Inicialización automática desde 0001 por empresa. Facturas y notas fiscales siguen el folio de Facturapi.",
    },
    {
      id: "parts",
      label: "SKUs LiftGo habilitados",
      required: false,
      ready: catalogs.global_parts_enabled > 0,
      description: `${catalogs.global_parts_enabled} SKUs globales activos. Recomendado para la operación con refacciones.`,
    },
    {
      id: "banks",
      label: "Cuentas bancarias activas",
      required: false,
      ready: detail.active_bank_accounts > 0,
      description: `${detail.active_bank_accounts} cuentas activas. La captura no verifica saldos ni confirma la cuenta ante el banco.`,
    },
  ];
}
