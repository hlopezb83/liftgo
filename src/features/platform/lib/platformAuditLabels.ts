import type { PlatformAuditEvent } from "@/lib/platformAudit.types";

export const PLATFORM_AUDIT_LABELS: Record<
  PlatformAuditEvent["target_type"],
  string
> = {
  organizations: "Empresas",
  equipment_model_catalog: "Modelos LiftGo",
  parts_catalog: "SKUs LiftGo",
  parts_catalog_equipment_models: "Compatibilidad de refacciones",
  legal_template_definitions: "Machotes legales",
  legal_template_versions: "Versiones legales",
  organization_legal_template_assignments: "Asignaciones legales",
  platform_operators: "Accesos de plataforma",
  platform_catalog_imports: "Incorporaciones de maestros",
};
export const AUDIT_ACTION_LABELS = {
  INSERT: "Alta",
  UPDATE: "Cambio",
  DELETE: "Baja",
} as const;
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  slug: "Identificador",
  classification: "Clasificación",
  city: "Ciudad",
  territory: "Territorio",
  contactName: "Nombre del contacto",
  contactEmail: "Correo del contacto",
  contactPhone: "Teléfono del contacto",
  is_active: "Estado activo",
  manufacturer: "Fabricante",
  model: "Modelo",
  sku: "SKU",
  capacity_kg: "Capacidad (kg)",
  mast_height_m: "Altura de mástil (m)",
  fuel_type: "Combustible",
  definition_id: "Machote",
  version_id: "Versión asignada",
  current_version_id: "Versión vigente",
  version: "Número de versión",
  checksum_sha256: "Huella del contenido",
  document_type: "Tipo de documento",
  part_catalog_id: "Refacción global",
  equipment_model_catalog_id: "Modelo global",
  auth_user_id: "Usuario",
  access_profile: "Perfil de plataforma",
  permission_revision: "Revisión de permisos",
  content: "Contenido legal",
  local_overrides: "Ajustes locales",
  specifications: "Ficha técnica",
  image_url: "Imagen",
  spec_sheet_url: "Documento técnico",
  updated_by: "Responsable del cambio",
  kind: "Tipo de maestro",
  source_organization_id: "Empresa de origen",
  source_record_id: "Registro de origen",
  target_catalog_id: "Maestro global",
  target_version_id: "Versión incorporada",
  resolution: "Resolución",
  source_checksum: "Huella del origen",
};

export function auditTargetName(event: PlatformAuditEvent): string {
  const state = event.new_state ?? event.old_state;
  return state?.name || state?.model || state?.sku || event.target_id;
}

export function auditValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
}
