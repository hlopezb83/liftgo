import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DocumentIcon, HistoryIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PlatformLegalTemplateRow } from "@/lib/platformLegalTemplates.functions";
import { usePlatformLegalTemplates } from "../hooks/usePlatformLegalTemplates";
import { PlatformLegalTemplateAssignmentsDialog } from "./legalTemplates/PlatformLegalTemplateAssignmentsDialog";
import { PlatformLegalTemplatePublishDialog } from "./legalTemplates/PlatformLegalTemplatePublishDialog";

type DialogState = { kind: "publish" | "assign"; template: PlatformLegalTemplateRow } | null;

export function PlatformLegalTemplatesCard() {
  const { data, isLoading, isError, refetch } = usePlatformLegalTemplates(true);
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DocumentIcon className="h-5 w-5" /> Machotes legales globales
          </CardTitle>
          <CardDescription>
            Plataforma publica versiones inmutables y controla qué versión adopta cada empresa LiftGo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isError ? (
            <QueryErrorState bare entity="las plantillas legales" onRetry={() => void refetch()} />
          ) : isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plantilla</TableHead>
                  <TableHead>Vigente</TableHead>
                  <TableHead>Adopción</TableHead>
                  <TableHead>Historial</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.document_type}</div>
                    </TableCell>
                    <TableCell>
                      <div><Badge>Versión {row.current_version ?? "—"}</Badge></div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {row.checksum_sha256 ? `${row.checksum_sha256.slice(0, 12)}…` : "Sin checksum"}
                      </div>
                    </TableCell>
                    <TableCell>{row.assignment_count}/{row.active_organization_count} empresas</TableCell>
                    <TableCell>{row.version_count} versiones</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "assign", template: row })}>
                        <HistoryIcon className="mr-2 h-4 w-4" /> Asignaciones
                      </Button>
                      <Button size="sm" onClick={() => setDialog({ kind: "publish", template: row })}>
                        Publicar versión
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No hay machotes legales globales.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {dialog?.kind === "publish" && (
        <PlatformLegalTemplatePublishDialog
          open
          template={dialog.template}
          onOpenChange={(open) => { if (!open) setDialog(null); }}
        />
      )}
      {dialog?.kind === "assign" && (
        <PlatformLegalTemplateAssignmentsDialog
          open
          template={dialog.template}
          onOpenChange={(open) => { if (!open) setDialog(null); }}
        />
      )}
    </>
  );
}
