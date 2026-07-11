import { useDocuments, useUploadDocument, useDeleteDocument } from "@/hooks/useDocuments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Paperclip, Trash2, Upload, FileText, Image, File } from "@/components/icons";

import { useRef } from "react";
import { notifySuccess } from "@/lib/ui/appFeedback";

function FileIcon({ mime }: { mime?: string | null }) {
  if (mime?.startsWith("image/")) return <Image className="h-4 w-4 text-status-rented" />;
  if (mime?.includes("pdf")) return <FileText className="h-4 w-4 text-destructive" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export function DocumentAttachments({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data: documents, isLoading } = useDocuments(entityType, entityId);
  const uploadDoc = useUploadDocument();
  const deleteDoc = useDeleteDocument();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) { await uploadDoc.mutateAsync({ file, entityType, entityId }); }
    notifySuccess(`${files.length} archivo(s) subido(s)`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDelete = (id: string) => {
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
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploadDoc.isPending}>
            <Upload className="h-3.5 w-3.5 mr-1" />{uploadDoc.isPending ? "Subiendo..." : "Subir"}
          </Button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={handleUpload} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : documents && documents.length > 0 ? (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 text-sm">
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline flex-1 min-w-0">
                  <FileIcon mime={doc.mime_type} />
                  <span className="truncate">{doc.file_name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatSize(doc.file_size)}</span>
                </a>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDelete(doc.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
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
