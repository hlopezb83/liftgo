/**
 * Operación de plataforma (tramo 9 multiempresa): alta de empresas con su
 * primer administrador y suspensión/reactivación.
 *
 * Visibilidad: sólo operadores de plataforma confirmados por el servidor. La
 * autorización real vive en `requirePlatformOperator` y en las funciones
 * `platform_*` de la base; esta página nunca decide permisos por sí misma.
 */
import { useState } from "react";
import { CompanyIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CreateOrganizationResult } from "@/lib/platformAdmin.functions";
import {
  usePlatformOperatorStatus,
  usePlatformOrganizations,
} from "../hooks/usePlatformOperator";
import {
  CreateOrganizationDialog,
  CreatedResultDialog,
  OrganizationRowActions,
} from "../components/PlatformOrganizationDialogs";

export default function PlatformOrganizationsPage() {
  const { data: isOperator, isLoading: loadingOperator } =
    usePlatformOperatorStatus();
  const {
    data: organizations,
    isLoading,
    isError,
    refetch,
  } = usePlatformOrganizations(isOperator === true);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreateOrganizationResult | null>(null);

  if (loadingOperator) return null;

  if (isOperator !== true) {
    return (
      <div className="space-y-6">
        <PageHeader title="Empresas" subtitle="Operación de plataforma" />
        <Alert>
          <AlertTitle>Sección restringida</AlertTitle>
          <AlertDescription>
            El alta y la suspensión de empresas sólo están disponibles para
            operadores de plataforma.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empresas"
        subtitle="Alta de empresas con su primer administrador y suspensión/reactivación"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <CompanyIcon className="h-4 w-4 mr-2" /> Nueva empresa
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Empresas registradas</CardTitle>
          <CardDescription>
            Cada usuario pertenece a una sola empresa; una empresa suspendida
            bloquea a todos sus miembros hasta reactivarla.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isError ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo cargar la lista</AlertTitle>
              <AlertDescription className="flex items-center gap-3">
                Reintenta en unos segundos.
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void refetch()}
                >
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Identificador</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Usuarios</TableHead>
                  <TableHead className="text-right">Portal</TableHead>
                  <TableHead className="text-right">Clientes</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(organizations ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.slug}
                    </TableCell>
                    <TableCell>
                      {row.is_active ? (
                        <Badge>Activa</Badge>
                      ) : (
                        <Badge variant="secondary">Suspendida</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.internal_members}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.portal_accounts}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.customers}
                    </TableCell>
                    <TableCell className="text-right">
                      <OrganizationRowActions row={row} />
                    </TableCell>
                  </TableRow>
                ))}
                {(organizations ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No hay empresas registradas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateOrganizationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setCreated}
      />
      <CreatedResultDialog result={created} onClose={() => setCreated(null)} />
    </div>
  );
}
