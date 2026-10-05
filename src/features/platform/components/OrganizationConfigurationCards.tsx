import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PlatformOrganizationDetail } from "@/lib/platformOrganizationDetail.types";

const DOCUMENT_LABELS: Record<string, string> = {
  quote: "Cotizaciones",
  contract: "Contratos",
  booking: "Reservas",
  delivery: "Entregas",
  return_inspection: "Devoluciones",
  supplier_bill: "Facturas de proveedor",
};

function FiscalConfigurationCard({
  detail,
}: {
  detail: PlatformOrganizationDetail;
}) {
  const { settings, billing } = detail;
  const fiscal = [
    ["Razón social", settings.razon_social],
    ["RFC", settings.rfc],
    ["Régimen fiscal", settings.regimen_fiscal],
    ["Código postal de expedición", settings.postal_code],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración fiscal</CardTitle>
        <CardDescription>
          Lectura de la configuración de esta empresa. Los cambios se realizan
          en su ERP.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.records > 1 ? (
          <p role="alert" className="text-sm text-destructive">
            Hay más de una configuración fiscal; no se eligió una
            arbitrariamente.
          </p>
        ) : (
          <dl className="space-y-4">
            {fiscal.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words text-sm font-medium">
                  {value || "Sin configurar"}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="border-t pt-4">
          <p className="text-xs text-muted-foreground">Facturapi</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">
              {billing.mode === "test"
                ? "Pruebas"
                : billing.mode === "live"
                  ? "Producción"
                  : "Ambiente sin configurar"}
            </Badge>
            <Badge variant={billing.key_configured ? "outline" : "secondary"}>
              {billing.key_configured ? "Llave configurada" : "Llave pendiente"}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Disponibilidad y formato de la llave del ambiente seleccionado. No
            verifica al proveedor ni muestra su valor.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function AdministratorsCard({
  detail,
}: {
  detail: PlatformOrganizationDetail;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Administradores</CardTitle>
        <CardDescription>
          Cuentas internas con rol Admin. Esta vista no modifica sus permisos ni
          contraseñas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {detail.administrators.length ? (
          <ul className="divide-y">
            {detail.administrators.map((admin) => (
              <li
                key={admin.user_id}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {admin.full_name || "Nombre no registrado"}
                  </p>
                  <p className="mt-1 break-all text-sm text-muted-foreground">
                    {admin.email || "Correo no disponible"}
                  </p>
                </div>
                <Badge variant={admin.is_active ? "outline" : "secondary"}>
                  {admin.is_active ? "Cuenta activa" : "Cuenta inactiva"}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay administradores internos asignados.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CatalogsCard({ detail }: { detail: PlatformOrganizationDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Catálogos y documentos</CardTitle>
        <CardDescription>
          Habilitación de registros del catálogo compartido, sin tarifas ni existencias
          empresariales.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-muted-foreground">
              Modelos LiftGo habilitados
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {detail.catalogs.global_models_enabled}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              SKUs LiftGo habilitados
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {detail.catalogs.global_parts_enabled}
            </dd>
          </div>
        </dl>
        {detail.templates.length ? (
          <ul className="divide-y border-t">
            {detail.templates.map((template) => (
              <li
                key={template.definition_id}
                className="space-y-2 py-3 last:pb-0"
              >
                <p className="text-sm font-medium">{template.name}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Versión {template.version}</Badge>
                  <Badge variant="secondary">
                    {template.is_active
                      ? template.is_current
                        ? "Vigente global"
                        : "Versión anterior"
                      : "Asignación inactiva"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin plantillas legales compartidas asignadas.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FoliosCard({ detail }: { detail: PlatformOrganizationDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Folios y bancos</CardTitle>
        <CardDescription>
          Contadores reservados por esta empresa. La consulta no consume folios.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {detail.counters.length ? (
          <dl className="space-y-3">
            {detail.counters.map((counter) => (
              <div
                key={counter.document_type}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <dt className="text-muted-foreground">
                  {DOCUMENT_LABELS[counter.document_type] ??
                    counter.document_type}
                </dt>
                <dd className="font-mono tabular-nums">
                  {counter.next_value.padStart(4, "0")}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Los contadores se inicializan automáticamente al emitir el primer
            documento.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Inicio desde 0001; al superar cuatro dígitos se conserva el número
          completo. La factura fiscal usa el folio asignado por Facturapi.
        </p>
        <p className="border-t pt-4 text-sm">
          <span className="font-medium">{detail.active_bank_accounts}</span>{" "}
          cuentas bancarias activas. No se muestran números de cuenta ni saldos.
        </p>
      </CardContent>
    </Card>
  );
}

export function OrganizationConfigurationCards({
  detail,
}: {
  detail: PlatformOrganizationDetail;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <FiscalConfigurationCard detail={detail} />
      <AdministratorsCard detail={detail} />
      <CatalogsCard detail={detail} />
      <FoliosCard detail={detail} />
    </div>
  );
}
