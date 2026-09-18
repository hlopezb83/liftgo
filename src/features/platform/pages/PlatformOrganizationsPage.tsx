/**
 * Operación de plataforma (tramo 9 multiempresa): alta de empresas con su
 * primer administrador y suspensión/reactivación.
 *
 * Visibilidad: sólo operadores de plataforma confirmados por el servidor. La
 * autorización real vive en `requirePlatformOperator` y en las funciones
 * `platform_*` de la base; esta página nunca decide permisos por sí misma.
 */
import { useState, type FormEvent } from "react";
import { CompanyIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CreateOrganizationResult, PlatformOrganizationRow } from "@/lib/platformAdmin.functions";
import {
  useCreateOrganization,
  usePlatformOperatorStatus,
  usePlatformOrganizations,
  useSetOrganizationActive,
} from "../hooks/usePlatformOperator";

const EMPTY_FORM = { name: "", slug: "", admin_email: "", admin_full_name: "" };

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function CreateOrganizationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: CreateOrganizationResult) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const create = useCreateOrganization();

  const update = (field: keyof typeof EMPTY_FORM) => (value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "name" && !slugTouched) next.slug = slugify(value);
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await create.mutateAsync(form);
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    onOpenChange(false);
    onCreated(result);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
            <DialogDescription>
              Se crea la empresa y su primer administrador en una sola operación. Si algo falla, no queda ninguna empresa a medias.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="org-name">Nombre de la empresa</Label>
            <Input id="org-name" required minLength={2} maxLength={120} value={form.name} onChange={(e) => update("name")(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Identificador (slug)</Label>
            <Input
              id="org-slug"
              required
              pattern="[a-z0-9][a-z0-9-]{1,62}"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                update("slug")(e.target.value.toLowerCase());
              }}
            />
            <p className="text-xs text-muted-foreground">Minúsculas, dígitos y guiones. No se puede cambiar después.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-admin-name">Nombre del primer administrador</Label>
            <Input id="org-admin-name" required maxLength={200} value={form.admin_full_name} onChange={(e) => update("admin_full_name")(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-admin-email">Correo del primer administrador</Label>
            <Input id="org-admin-email" type="email" required value={form.admin_email} onChange={(e) => update("admin_email")(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creando…" : "Crear empresa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreatedResultDialog({
  result,
  onClose,
}: {
  result: CreateOrganizationResult | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!result} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Empresa creada</DialogTitle>
          <DialogDescription>
            Comparte el enlace de acceso con {result?.admin_email}. Es de un solo uso y le permite definir su contraseña.
          </DialogDescription>
        </DialogHeader>
        {result?.recovery_link ? (
          <Input readOnly value={result.recovery_link} onFocus={(e) => e.currentTarget.select()} />
        ) : (
          <Alert>
            <AlertTitle>Sin enlace de acceso</AlertTitle>
            <AlertDescription>
              La empresa y el administrador se crearon, pero no se pudo generar el enlace. El administrador puede usar "Olvidé mi contraseña" con su correo.
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrganizationRowActions({ row }: { row: PlatformOrganizationRow }) {
  const toggle = useSetOrganizationActive();
  const [confirming, setConfirming] = useState(false);

  if (row.is_active) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)} disabled={toggle.isPending}>
          Suspender
        </Button>
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Suspender {row.name}</DialogTitle>
              <DialogDescription>
                Todos sus usuarios internos y cuentas de portal perderán el acceso de inmediato. Los datos se conservan y la empresa puede reactivarse después.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={toggle.isPending}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={toggle.isPending}
                onClick={() =>
                  toggle.mutate(
                    { organization_id: row.id, active: false },
                    { onSettled: () => setConfirming(false) },
                  )
                }
              >
                {toggle.isPending ? "Suspendiendo…" : "Suspender empresa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={toggle.isPending}
      onClick={() => toggle.mutate({ organization_id: row.id, active: true })}
    >
      {toggle.isPending ? "Reactivando…" : "Reactivar"}
    </Button>
  );
}

export default function PlatformOrganizationsPage() {
  const { data: isOperator, isLoading: loadingOperator } = usePlatformOperatorStatus();
  const { data: organizations, isLoading, isError, refetch } = usePlatformOrganizations(isOperator === true);
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
            El alta y la suspensión de empresas sólo están disponibles para operadores de plataforma.
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
            Cada usuario pertenece a una sola empresa; una empresa suspendida bloquea a todos sus miembros hasta reactivarla.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isError ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo cargar la lista</AlertTitle>
              <AlertDescription className="flex items-center gap-3">
                Reintenta en unos segundos.
                <Button size="sm" variant="outline" onClick={() => void refetch()}>Reintentar</Button>
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
                    <TableCell className="font-mono text-xs">{row.slug}</TableCell>
                    <TableCell>
                      {row.is_active ? <Badge>Activa</Badge> : <Badge variant="secondary">Suspendida</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{row.internal_members}</TableCell>
                    <TableCell className="text-right">{row.portal_accounts}</TableCell>
                    <TableCell className="text-right">{row.customers}</TableCell>
                    <TableCell className="text-right">
                      <OrganizationRowActions row={row} />
                    </TableCell>
                  </TableRow>
                ))}
                {(organizations ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      No hay empresas registradas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setCreated} />
      <CreatedResultDialog result={created} onClose={() => setCreated(null)} />
    </div>
  );
}
