import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DocumentIcon, HistoryIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PlatformLegalTemplateRow } from "@/lib/platformLegalTemplates.functions";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { usePlatformLegalTemplates } from "../hooks/usePlatformLegalTemplates";
import { PlatformLegalTemplateAssignmentsDialog } from "./legalTemplates/PlatformLegalTemplateAssignmentsDialog";
import { PlatformLegalTemplateHistoryDialog } from "./legalTemplates/PlatformLegalTemplateHistoryDialog";
import { PlatformLegalTemplatePublishDialog } from "./legalTemplates/PlatformLegalTemplatePublishDialog";

type DialogState = { kind: "publish" | "assign" | "history"; template: PlatformLegalTemplateRow } | null;

export function PlatformLegalTemplatesCard() {
  const { can } = usePlatformCapabilities();
  const { data, isLoading, isError, refetch } = usePlatformLegalTemplates(can("templates.read"));
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DocumentIcon className="h-5 w-5" /> Plantillas legales compartidas
          </CardTitle>
          <CardDescription>
            Publica una nueva versión y elige qué empresas la usan. Las versiones anteriores se conservan.
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
                      <div className="text-xs text-muted-foreground">{row.document_type === "rental_contract" ? "Contrato de renta" : row.document_type === "promissory_note" ? "Pagaré" : "Documento legal"}</div>
                    </TableCell>
                    <TableCell>
                      <div><Badge>Versión {row.current_version ?? "—"}</Badge></div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {row.checksum_sha256 ? `${row.checksum_sha256.slice(0, 12)}…` : "Sin checksum"}
                      </div>
                    </TableCell>
                    <TableCell>{row.assignment_count}/{row.active_organization_count} empresas</TableCell>
                    <TableCell><Button variant="ghost" size="sm" aria-label={`Ver historial de ${row.name}`}
                      onClick={() => setDialog({ kind: "history", template: row })}>{row.version_count} versiones</Button></TableCell>
                    <TableCell className="space-x-2 text-right">
                      {can("templates.assign") && <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "assign", template: row })}>
                        <HistoryIcon className="mr-2 h-4 w-4" /> Asignaciones
                      </Button>}
                      {can("templates.publish") && <Button size="sm" onClick={() => setDialog({ kind: "publish", template: row })}>
                        Publicar versión
                      </Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {(data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Aún no hay plantillas legales compartidas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {can("templates.read") && dialog?.kind === "history" && <PlatformLegalTemplateHistoryDialog template={dialog.template} onClose={() => setDialog(null)} />}
      {can("templates.publish") && dialog?.kind === "publish" && (
        <PlatformLegalTemplatePublishDialog
          open
          template={dialog.template}
          onOpenChange={(open) => { if (!open) setDialog(null); }}
        />
      )}
      {can("templates.assign") && dialog?.kind === "assign" && (
        <PlatformLegalTemplateAssignmentsDialog
          open
          template={dialog.template}
          onOpenChange={(open) => { if (!open) setDialog(null); }}
        />
      )}
    </>
  );
}
