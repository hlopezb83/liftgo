import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { CompanyIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreateOrganizationResult } from "@/lib/platformAdmin.types";
import { ORGANIZATION_CLASSIFICATION_LABELS, type OrganizationClassification } from "@/lib/platformOrganizationGovernance.types";
import { PendingPlatformOnboarding } from "../components/PendingPlatformOnboarding";
import {
  CreateOrganizationDialog,
  CreatedResultDialog,
} from "../components/PlatformOrganizationDialogs";
import { PlatformOrganizationList } from "../components/PlatformOrganizationList";
import { useOrganizationGovernanceList } from "../hooks/useOrganizationGovernance";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { usePlatformOrganizations } from "../hooks/usePlatformOperator";
import { filterOrganizationRegistry } from "../lib/organizationGovernanceList";

const PAGE_SIZE = 20;

export default function PlatformOrganizationsPage() {
  const { can } = usePlatformCapabilities();
  const query = usePlatformOrganizations(can("organizations.read"));
  const governance = useOrganizationGovernanceList(can("organizations.read"));
  const [classification, setClassification] = useState<OrganizationClassification | "">("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreateOrganizationResult | null>(null);
  const rows = filterOrganizationRegistry(query.data, governance.data, { search, status, classification });
  const lastPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = rows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const hasFilters = [search, status, classification].some(Boolean);
  function clearFilters() {
    setSearch("");
    setStatus("");
    setClassification("");
    setPage(0);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empresas"
        subtitle="Configuración, administradores, habilitación y actividad del ecosistema LiftGo."
        actions={
          can("organizations.create") && <Button onClick={() => setCreateOpen(true)}>
            <CompanyIcon className="mr-2 h-4 w-4" />
            Nueva empresa
          </Button>
        }
      />
      {can("organizations.create") && <PendingPlatformOnboarding onCompleted={setCreated} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_200px]">
        <div className="space-y-2">
          <Label htmlFor="platform-company-search">Buscar empresa</Label>
          <Input
            id="platform-company-search"
            placeholder="Nombre, razón social, ciudad o territorio"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="platform-company-status">Acceso empresarial</Label>
          <select
            id="platform-company-status"
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas las empresas</option>
            <option value="active">Activas</option>
            <option value="inactive">Sin acceso</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="platform-company-classification">Clasificación</Label>
          <select id="platform-company-classification" className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            value={classification} disabled={!governance.data || governance.isError}
            onChange={(event) => { setClassification(event.target.value as OrganizationClassification | ""); setPage(0); }}>
            <option value="">Todas las clasificaciones</option>
            {Object.entries(ORGANIZATION_CLASSIFICATION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </div>
      {governance.isError && <QueryErrorState error={governance.error} entity="la clasificación y el territorio"
        onRetry={() => void governance.refetch()} isRetrying={governance.isFetching} />}
      {query.isError ? (
        <QueryErrorState error={query.error}
          entity="las empresas"
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      ) : query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {visible.length ? (
            <PlatformOrganizationList rows={visible} />
          ) : (
            <Card>
              <CardContent className="space-y-3 py-12 text-center">
                <p className="font-medium">
                  {query.data?.length
                    ? "No hay empresas para estos filtros"
                    : "No hay empresas registradas"}
                </p>
                {hasFilters && (
                  <Button variant="outline" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? "empresa" : "empresas"} ·
              Página {currentPage + 1} de {lastPage + 1}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={currentPage >= lastPage}
                onClick={() => setPage(currentPage + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        La ficha permite revisar la configuración sin entrar al ERP de otra
        empresa. Sin acceso incluye suspensión o alta pendiente de completar.
      </p>
      {can("organizations.create") && <CreateOrganizationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setCreated}
      />}
      <CreatedResultDialog result={created} onClose={() => setCreated(null)} />
    </div>
  );
}
