import { useRef, type ChangeEvent as ReactChangeEvent } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { useConfirm } from "@/components/feedback/useConfirm";
import { Paperclip, DeleteIcon, UploadIcon, DocumentIcon, Image, File } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DOC_ACCEPT, DOC_MAX_BYTES, partitionFiles } from "@/features/fleet/lib/documentAttachmentRules";
import { useHasModuleAccess } from "@/features/users";
import { useDocuments, useDeleteDocument } from "@/hooks/useDocuments";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { useDocumentUploadBatch } from "../../hooks/useDocumentUploadBatch";


function FileIcon({ mime }: { mime?: string | null }) {
  if (mime?.startsWith("image/")) return <Image className="h-4 w-4 text-status-rented" />;
  if (mime?.includes("pdf")) return <DocumentIcon className="h-4 w-4 text-destructive" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

type Props = { entityType: string; entityId: string; accessModule: "Flota" | "Proveedores" };

export function DocumentAttachments({ entityType, entityId, accessModule }: Props) {
  const identity = useVerifiedIdentityScope();
  const canManage = useHasModuleAccess(accessModule, "full");
  return <DocumentAttachmentsContent key={JSON.stringify([identity, entityType, entityId, canManage])}
    entityType={entityType} entityId={entityId} canManage={Boolean(identity) && canManage} />;
}

function DocumentAttachmentsContent({ entityType, entityId, canManage }: Omit<Props, "accessModule"> & { canManage: boolean }) {
  const { data: documents, isLoading, isError, isFetching, error, refetch } = useDocuments(entityType, entityId);
  const batch = useDocumentUploadBatch(entityType, entityId, canManage);
  const deleteDoc = useDeleteDocument();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: ReactChangeEvent<HTMLInputElement>) => {
    if (!canManage || batch.pending || batch.failed.length > 0) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const all = Array.from(files);
    // R7 Bloque 19d: rechazamos formatos y tamaños fuera de rango con toast claro
    // en vez de fallar en silencio o dejar que Storage devuelva un 4xx opaco.
    const { accepted, rejected } = partitionFiles(all);
    if (rejected.length > 0) {
      const names = rejected.map((f) => f.name).join(", ");
      notifyValidation({ message: `Rechazado: ${names}. Solo PDF o imágenes ≤ ${DOC_MAX_BYTES / 1024 / 1024} MB.` });
    }
    if (accepted.length === 0) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    // Clear the picker immediately; the batch retains only failed File objects for retry.
    e.target.value = "";
    await batch.uploadFiles(accepted);
  };

  const handleDelete = async (id: string, fileName: string) => {
    if (!canManage) return;
    const ok = await confirm({
      title: "¿Eliminar adjunto?",
      description: `Se eliminará "${fileName}" permanentemente. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    deleteDoc.mutate(id, { onSuccess: () => notifySuccess("Archivo eliminado") });
  };

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Paperclip className="h-4 w-4" /> Adjuntos</CardTitle>
          {canManage && <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={batch.pending || batch.failed.length > 0}>
            <UploadIcon className="h-3.5 w-3.5 mr-1" />{batch.pending ? "Subiendo…" : "Subir"}
          </Button>}
          {canManage && <input ref={fileRef} type="file" multiple accept={DOC_ACCEPT} className="hidden"
            disabled={batch.pending || batch.failed.length > 0} onChange={handleUpload} />}
        </div>
      </CardHeader>
      <CardContent>
        {batch.pending && <p role="status" className="mb-3 text-sm text-muted-foreground">Subiendo archivos. Espera a que termine el lote.</p>}
        {batch.failed.length > 0 && <div className="mb-4 space-y-2" role="alert">
          <p className="text-sm font-medium">No se pudieron subir {batch.failed.length} archivo(s).</p>
          <ul className="space-y-1 text-sm">
            {batch.failed.map(({ file, message }, i) => <li key={i} className="break-words">{file.name}: {message}</li>)}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={batch.pending} onClick={() => { void batch.retryFailed(); }}>
              Reintentar fallidos ({batch.failed.length})
            </Button>
            <Button variant="ghost" size="sm" disabled={batch.pending} onClick={batch.discardFailed}>Descartar fallidos</Button>
          </div>
        </div>}
        {isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Cargando adjuntos…</p>
        ) : isError ? (
          <QueryErrorState bare entity="los adjuntos" error={error} onRetry={() => { void refetch(); }} isRetrying={isFetching} />
        ) : documents && documents.length > 0 ? (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 text-sm">
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline flex-1 min-w-0">
                  <FileIcon mime={doc.mime_type} />
                  <span className="truncate">{doc.file_name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatSize(doc.file_size)}</span>
                </a>
                {canManage && <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Eliminar documento" title="Eliminar documento" onClick={() => handleDelete(doc.id, doc.file_name)}>
                  <DeleteIcon className="h-3.5 w-3.5 text-destructive" />
                </Button>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">Sin adjuntos</p>
        )}
      </CardContent>
    </Card>
  );
}
