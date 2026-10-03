import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { BackIcon, HistoryIcon, RefreshIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams } from "@/lib/router-compat";
import { Link } from "@/lib/router-compat-ui";
import { OrganizationConfigurationCards } from "../components/OrganizationConfigurationCards";
import { OrganizationGovernanceCard } from "../components/OrganizationGovernanceCard";
import { OrganizationReadinessCard } from "../components/OrganizationReadinessCard";
import { OrganizationStatusAction } from "../components/OrganizationStatusAction";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { usePlatformOrganizationDetail } from "../hooks/usePlatformReadModels";

export default function PlatformOrganizationDetailPage() {
  const { can } = usePlatformCapabilities();
  const { organizationId = "" } = useParams<{ organizationId: string }>();
  const query = usePlatformOrganizationDetail(organizationId);
  const detail = query.data;
  const back = (
    <Button asChild variant="ghost" size="sm">
      <Link to="/platform/organizations">
        <BackIcon className="mr-2 h-4 w-4" />
        Empresas
      </Link>
    </Button>
  );
  if (query.isError)
    return (
      <div className="space-y-4">
        {back}
        <QueryErrorState error={query.error}
          entity="la ficha de empresa"
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      </div>
    );
  if (!detail)
    return (
      <div className="space-y-6">
        {back}
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  const org = detail.organization;
  return (
    <div className="space-y-6">
      {back}
      <PageHeader
        title={org.name}
        subtitle={
          detail.settings.razon_social || "Ficha administrativa de la empresa"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Actualizar ficha"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshIcon
                className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
            </Button>
            <OrganizationStatusAction
              id={org.id}
              name={org.name}
              active={org.is_active}
              canSuspend={detail.can_suspend}
            />
          </div>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={org.is_active ? "outline" : "secondary"}>
            {org.is_active ? "Activa" : "Sin acceso"}
          </Badge>
          <span className="break-all font-mono text-xs text-muted-foreground">
            {org.slug}
          </span>
        </div>
        {can("audit.read") && <Button asChild variant="outline" size="sm">
          <Link to={`/platform/audit?organization=${org.id}`}>
            <HistoryIcon className="mr-2 h-4 w-4" />
            Ver actividad de plataforma
          </Link>
        </Button>}
      </div>
      {!org.is_active && (
        <Alert>
          <AlertTitle>Acceso empresarial bloqueado</AlertTitle>
          <AlertDescription>
            La empresa está suspendida o su alta no está completa. Sus datos se
            conservan; revisa administradores y bitácora antes de reactivarla.
          </AlertDescription>
        </Alert>
      )}
      {org.is_active && !detail.can_suspend && (
        <p className="text-sm text-muted-foreground">
          No puedes suspender la empresa a la que perteneces.
        </p>
      )}
      <OrganizationReadinessCard detail={detail} />
      <OrganizationGovernanceCard key={org.id} organizationId={org.id} />
      <OrganizationConfigurationCards detail={detail} />
      <p className="text-xs text-muted-foreground">
        Consulta:{" "}
        <time dateTime={detail.checked_at}>
          {new Date(detail.checked_at).toLocaleString("es-MX")}
        </time>
        . Hora local del navegador. La ficha no concede acceso al ERP de otra
        empresa.
      </p>
    </div>
  );
}
