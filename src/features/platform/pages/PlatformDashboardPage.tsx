import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import {
  CompanyIcon,
  FleetIcon,
  HistoryIcon,
  OpenLinkIcon,
} from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/lib/router-compat-ui";
import { usePlatformOrganizations } from "../hooks/usePlatformOperator";

export default function PlatformDashboardPage() {
  const organizations = usePlatformOrganizations(true);
  const rows = organizations.data;
  const stats = [
    { label: "Empresas registradas", value: rows?.length },
    {
      label: "Empresas activas",
      value: rows?.filter((row) => row.is_active).length,
    },
    {
      label: "Empresas sin acceso",
      value: rows?.filter((row) => !row.is_active).length,
    },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Centro de Plataforma"
        subtitle="Administra el ecosistema LiftGo y sus datos compartidos."
      />
      {organizations.isError ? (
        <QueryErrorState
          entity="las empresas"
          onRetry={() => void organizations.refetch()}
        />
      ) : (
        <section
          aria-label="Estado de las empresas"
          className="grid gap-4 sm:grid-cols-3"
        >
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="pb-2">
                <CardDescription>{stat.label}</CardDescription>
              </CardHeader>
              <CardContent>
                {stat.value === undefined ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  <p className="text-3xl font-semibold tabular-nums">
                    {stat.value}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}
      <section
        aria-label="Administración global"
        className="grid gap-4 xl:grid-cols-3"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CompanyIcon className="h-5 w-5" />
              Empresas
            </CardTitle>
            <CardDescription>
              Alta de organizaciones, administrador inicial y estado de acceso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/platform/organizations">
                Administrar empresas
                <OpenLinkIcon className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FleetIcon className="h-5 w-5" />
              Catálogo LiftGo
            </CardTitle>
            <CardDescription>
              Modelos, SKUs de refacciones y versiones de machotes legales.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/platform/catalogs">
                Administrar catálogos
                <OpenLinkIcon className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HistoryIcon className="h-5 w-5" />
              Bitácora global
            </CardTitle>
            <CardDescription>
              Actor, motivo y cambios de empresas y maestros compartidos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/platform/audit">
                Consultar actividad
                <OpenLinkIcon className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
      <p className="text-sm text-muted-foreground">
        Los conteos incluyen todas las organizaciones registradas. Las tarifas,
        existencias y datos fiscales se administran en el ERP de cada empresa.
      </p>
    </div>
  );
}
