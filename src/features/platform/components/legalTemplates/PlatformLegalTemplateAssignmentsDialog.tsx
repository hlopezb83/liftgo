import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PlatformLegalTemplateRow } from "@/lib/platformLegalTemplates.functions";
import {
  useAssignPlatformLegalTemplateVersion,
  usePlatformLegalTemplateAssignments,
  usePlatformLegalTemplateVersions,
} from "../../hooks/usePlatformLegalTemplates";

export function PlatformLegalTemplateAssignmentsDialog({
  template,
  open,
  onOpenChange,
}: {
  template: PlatformLegalTemplateRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const assignments = usePlatformLegalTemplateAssignments(template.id, open);
  const versions = usePlatformLegalTemplateVersions(template.id, open);
  const assign = useAssignPlatformLegalTemplateVersion();
  const [selected, setSelected] = useState<Record<string, string>>({});

  const save = (organizationId: string) => {
    const versionId = selected[organizationId];
    if (!versionId) return;
    assign.mutate({
      organization_id: organizationId,
      definition_id: template.id,
      version_id: versionId,
    });
  };

  const hasError = assignments.isError || versions.isError;
  const isLoading = assignments.isLoading || versions.isLoading;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Adopción por empresa"
      description="Cada empresa puede conservar una versión anterior. Los contratos ya firmados mantienen su copia histórica."
      width="2xl"
      isPending={assign.isPending}
    >
      {hasError ? (
        <QueryErrorState
          bare
          entity="las asignaciones legales"
          onRetry={() => { void assignments.refetch(); void versions.refetch(); }}
        />
      ) : isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Versión adoptada</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(assignments.data ?? []).map((row) => {
              const selectedVersion = selected[row.organization_id] ?? row.version_id ?? "";
              const changed = selectedVersion !== (row.version_id ?? "");
              return (
                <TableRow key={row.organization_id}>
                  <TableCell>
                    <div className="font-medium">{row.organization_name}</div>
                    <div className="text-xs text-muted-foreground">{row.organization_slug}</div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={selectedVersion}
                      onValueChange={(value) => setSelected((current) => ({ ...current, [row.organization_id]: value }))}
                      disabled={!row.organization_is_active || assign.isPending}
                    >
                      <SelectTrigger className="w-[190px]"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                      <SelectContent>
                        {(versions.data ?? []).map((version) => (
                          <SelectItem key={version.id} value={version.id}>
                            Versión {version.version} · {version.checksum_sha256.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.organization_is_active ? "default" : "secondary"}>
                      {row.organization_is_active ? "Activa" : "Suspendida"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!changed || !selectedVersion || !row.organization_is_active || assign.isPending}
                      onClick={() => save(row.organization_id)}
                    >
                      Asignar
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <FormDialogFooter>
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={assign.isPending} label="Cerrar" />
      </FormDialogFooter>
    </FormDialog>
  );
}
