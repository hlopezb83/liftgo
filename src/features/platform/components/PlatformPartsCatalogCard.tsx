import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { AddIcon, EditIcon, InventoryIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PlatformEquipmentModelRow, PlatformPartCatalogRow } from "@/lib/platformCatalog.functions";
import {
  usePlatformPartsCatalog,
  useSetPlatformPartCatalogActive,
} from "../hooks/usePlatformEquipmentCatalog";
import { PlatformPartCatalogDialog } from "./PlatformPartCatalogDialog";

export function PlatformPartsCatalogCard({ models }: { models: PlatformEquipmentModelRow[] }) {
  const { data, isLoading, isError, refetch } = usePlatformPartsCatalog(true);
  const setActive = useSetPlatformPartCatalogActive();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformPartCatalogRow | null>(null);

  const create = () => { setEditing(null); setOpen(true); };
  const edit = (row: PlatformPartCatalogRow) => { setEditing(row); setOpen(true); };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <InventoryIcon className="h-5 w-5" /> SKUs globales
            </CardTitle>
            <CardDescription>
              La identidad y compatibilidad son compartidas; existencias, costo y ubicación pertenecen a cada empresa.
            </CardDescription>
          </div>
          <Button onClick={create}><AddIcon className="mr-2 h-4 w-4" /> Nuevo SKU</Button>
        </CardHeader>
        <CardContent>
          {isError ? (
            <QueryErrorState bare entity="el catálogo global de refacciones" onRetry={() => void refetch()} />
          ) : isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>SKU / nombre</TableHead><TableHead>Fabricante</TableHead>
                <TableHead>Compatibilidad</TableHead><TableHead>Empresas</TableHead>
                <TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-mono font-medium">{row.sku}</div>
                      <div className="text-sm text-muted-foreground">{row.name}</div>
                    </TableCell>
                    <TableCell>{row.manufacturer ?? "—"}</TableCell>
                    <TableCell>{row.equipment_model_ids.length} modelos</TableCell>
                    <TableCell>{row.organization_count}</TableCell>
                    <TableCell><Badge variant={row.is_active ? "default" : "secondary"}>{row.is_active ? "Activo" : "Inactivo"}</Badge></TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button variant="ghost" size="icon" aria-label="Editar SKU global" onClick={() => edit(row)}>
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline" size="sm" disabled={setActive.isPending}
                        onClick={() => setActive.mutate({ id: row.id, active: !row.is_active })}
                      >{row.is_active ? "Desactivar" : "Reactivar"}</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No hay SKUs globales. Captura el primer maestro real de LiftGo.
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {open && (
        <PlatformPartCatalogDialog
          open
          onOpenChange={setOpen}
          part={editing}
          models={models}
        />
      )}
    </>
  );
}
