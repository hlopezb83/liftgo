import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { AddIcon, EditIcon, FleetIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FUEL_TYPE_LABELS } from "@/lib/constants";
import type { PlatformEquipmentModelRow } from "@/lib/platformCatalog.functions";
import { PlatformEquipmentModelDialog } from "../components/PlatformEquipmentModelDialog";
import { PlatformLegalTemplatesCard } from "../components/PlatformLegalTemplatesCard";
import { PlatformPartsCatalogCard } from "../components/PlatformPartsCatalogCard";
import {
  usePlatformEquipmentCatalog,
  useSetPlatformEquipmentModelActive,
} from "../hooks/usePlatformEquipmentCatalog";
import { usePlatformOperatorStatus } from "../hooks/usePlatformOperator";

export default function PlatformEquipmentCatalogPage() {
  const { data: isOperator, isLoading: loadingOperator } = usePlatformOperatorStatus();
  const { data, isLoading, isError, refetch } = usePlatformEquipmentCatalog(isOperator === true);
  const setActive = useSetPlatformEquipmentModelActive();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformEquipmentModelRow | null>(null);

  if (loadingOperator) return null;
  if (isOperator !== true) {
    return (
      <div className="space-y-6">
        <PageHeader title="Maestros compartidos LiftGo" subtitle="Operación de plataforma" />
        <Alert>
          <AlertTitle>Sección restringida</AlertTitle>
          <AlertDescription>Sólo los operadores de plataforma administran los maestros compartidos.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const create = () => { setEditing(null); setOpen(true); };
  const edit = (row: PlatformEquipmentModelRow) => { setEditing(row); setOpen(true); };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maestros compartidos LiftGo"
        subtitle="Modelos, refacciones y documentos globales para todas las organizaciones"
        actions={<Button onClick={create}><AddIcon className="mr-2 h-4 w-4" /> Nuevo modelo</Button>}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FleetIcon className="h-5 w-5" /> Modelos globales</CardTitle>
          <CardDescription>Las empresas conservan sus propias tarifas y deciden cuáles modelos habilitar.</CardDescription>
        </CardHeader>
        <CardContent>
          {isError ? (
            <QueryErrorState bare entity="el catálogo global" onRetry={() => void refetch()} />
          ) : isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fabricante / modelo</TableHead><TableHead>Ficha técnica</TableHead>
                <TableHead>Empresas</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell><div className="font-medium">{row.manufacturer}</div><div className="text-sm text-muted-foreground">{row.model}</div></TableCell>
                    <TableCell className="text-sm">
                      {row.capacity_kg ? `${row.capacity_kg} kg` : "Sin capacidad"}
                      {row.mast_height_m ? ` · ${row.mast_height_m} m` : ""}
                      {row.fuel_type ? ` · ${FUEL_TYPE_LABELS[row.fuel_type] || row.fuel_type}` : ""}
                    </TableCell>
                    <TableCell>{row.organization_count}</TableCell>
                    <TableCell><Badge variant={row.is_active ? "default" : "secondary"}>{row.is_active ? "Activo" : "Inactivo"}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" aria-label="Editar modelo global" onClick={() => edit(row)}><EditIcon className="h-4 w-4" /></Button>
                      <Button
                        variant="outline" size="sm"
                        disabled={setActive.isPending}
                        onClick={() => setActive.mutate({ id: row.id, active: !row.is_active })}
                      >{row.is_active ? "Desactivar" : "Reactivar"}</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No hay modelos globales.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <PlatformPartsCatalogCard models={data ?? []} />
      <PlatformLegalTemplatesCard />
      {open && <PlatformEquipmentModelDialog open onOpenChange={setOpen} model={editing} />}
    </div>
  );
}
