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
import { PendingPlatformOnboarding } from "../components/PendingPlatformOnboarding";
import {
  CreateOrganizationDialog,
  CreatedResultDialog,
} from "../components/PlatformOrganizationDialogs";
import { PlatformOrganizationList } from "../components/PlatformOrganizationList";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { usePlatformOrganizations } from "../hooks/usePlatformOperator";

const PAGE_SIZE = 20;
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export default function PlatformOrganizationsPage() {
  const { can } = usePlatformCapabilities();
  const query = usePlatformOrganizations(can("organizations.read"));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreateOrganizationResult | null>(null);
  const needle = normalize(search.trim());
  const rows = (query.data ?? []).filter((row) => {
    const statusMatches = !status || row.is_active === (status === "active");
    return (
      statusMatches &&
      normalize([row.name, row.razon_social, row.slug].join(" ")).includes(
        needle,
      )
    );
  });
  const lastPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = rows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  function clearFilters() {
    setSearch("");
    setStatus("");
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
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <div className="space-y-2">
          <Label htmlFor="platform-company-search">Buscar empresa</Label>
          <Input
            id="platform-company-search"
            placeholder="Nombre, razón social o identificador"
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
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
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
      </div>
      {query.isError ? (
        <QueryErrorState
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
                {(search || status) && (
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
