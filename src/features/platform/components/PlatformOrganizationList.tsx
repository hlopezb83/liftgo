import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PlatformOrganizationRow } from "@/lib/platformAdmin.types";
import { Link } from "@/lib/router-compat-ui";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { OrganizationClassificationBadge } from "./OrganizationGovernanceSummary";
import type { OrganizationWithGovernance } from "../lib/organizationGovernanceList";


function CompanyIdentity({ row }: { row: OrganizationWithGovernance }) {
  return (
    <div className="space-y-1">
      <p className="break-words font-medium">{row.name}</p>
      <p className="break-words text-sm text-muted-foreground">
        {row.razon_social || "Sin razón social configurada"}
      </p>
      <p className="break-all font-mono text-xs text-muted-foreground">
        {row.slug}
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <OrganizationClassificationBadge classification={row.governance?.classification} />
        {[row.governance?.city, row.governance?.territory].filter(Boolean).length > 0 &&
          <span className="break-words text-xs text-muted-foreground">
            {[row.governance?.city, row.governance?.territory].filter(Boolean).join(" · ")}
          </span>}
      </div>
    </div>
  );
}

function CompanyLink({ row }: { row: PlatformOrganizationRow }) {
  const { can } = usePlatformCapabilities();
  if (!can("organizations.details")) return null;
  return (
    <Button asChild variant="outline" size="sm">
      <Link
        to={`/platform/organizations/${row.id}`}
        aria-label={`Ver empresa ${row.name}`}
      >
        Ver empresa
      </Link>
    </Button>
  );
}

export function PlatformOrganizationList({
  rows,
}: {
  rows: OrganizationWithGovernance[];
}) {
  return (
    <>
      <Card className="hidden xl:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Acceso</TableHead>
                <TableHead className="text-right">Usuarios internos</TableHead>
                <TableHead className="text-right">Portal</TableHead>
                <TableHead className="text-right">Clientes</TableHead>
                <TableHead className="text-right">Ficha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-96">
                    <CompanyIdentity row={row} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.is_active ? "outline" : "secondary"}>
                      {row.is_active ? "Activa" : "Sin acceso"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.internal_members}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.portal_accounts}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.customers}
                  </TableCell>
                  <TableCell className="text-right">
                    <CompanyLink row={row} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2 xl:hidden">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardContent className="flex h-full flex-col gap-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <CompanyIdentity row={row} />
                </div>
                <Badge variant={row.is_active ? "outline" : "secondary"}>
                  {row.is_active ? "Activa" : "Sin acceso"}
                </Badge>
              </div>
              <dl className="grid grid-cols-3 gap-3 border-y py-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Internos</dt>
                  <dd className="mt-1 font-medium tabular-nums">
                    {row.internal_members}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Portal</dt>
                  <dd className="mt-1 font-medium tabular-nums">
                    {row.portal_accounts}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Clientes</dt>
                  <dd className="mt-1 font-medium tabular-nums">
                    {row.customers}
                  </dd>
                </div>
              </dl>
              <div className="mt-auto">
                <CompanyLink row={row} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
