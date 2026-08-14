import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadIcon, X, SpinnerIcon, ImageIcon } from "@/components/icons";
import { useUploadDocument } from "@/hooks/useDocuments";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { cn } from "@/lib/utils";

interface DragDropImageUploaderProps {
  entityType: string;
  entityId: string;
  maxFiles?: number;
  className?: string;
}

interface Preview { id: string; file: File; url: string }

export function DragDropImageUploader({ entityType, entityId, maxFiles = 10, className }: DragDropImageUploaderProps) {
  const uploadDoc = useUploadDocument();
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<Preview[]>([]);
  // Ref espejo: revoca sólo al desmontar (si el usuario cierra sin subir).
  const previewsRef = useRef<Preview[]>([]);
  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);
  useEffect(() => () => {
    previewsRef.current.forEach((p) => URL.revokeObjectURL(p.url));
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setPreviews((prev) => {
      const room = Math.max(maxFiles - prev.length, 0);
      const accepted = acceptedFiles.slice(0, room);
      if (acceptedFiles.length > room) {
        notifyError({
          error: new Error("max_files"),
          title: `Sólo se pueden adjuntar ${maxFiles} fotos`,
          description: "Se descartaron las fotos excedentes.",
          severity: "warning",
        });
      }
      const added = accepted.map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        url: URL.createObjectURL(file),
      }));
      return [...prev, ...added];
    });
  }, [maxFiles]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDropAccepted: onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".heic"] },
    maxFiles,
    multiple: true,
    // M-19a: no aceptar más fotos mientras hay una subida en curso.
    disabled: uploading,
  });

  const removePreview = (index: number) => {
    setPreviews((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== index);
    });
  };


  const handleUploadAll = async () => {
    if (previews.length === 0) return;
    setUploading(true);
    // Snapshot: el estado puede cambiar mientras las subidas están en vuelo.
    const targets = previews;
    try {
      // R7 · Deuda: uploads en paralelo (antes serial) para reducir latencia
      // percibida al subir varias evidencias a la vez.
      // M-19b: `allSettled` — antes un solo fallo abortaba el batch y, como
      // las exitosas no se removían, reintentar las DUPLICABA en el servidor.
      // Ahora solo se remueven (y se revoca su objectURL) las subidas con
      // éxito; las fallidas se conservan para reintento.
      const results = await Promise.allSettled(
        targets.map(({ file }) => uploadDoc.mutateAsync({ file, entityType, entityId })),
      );
      const succeededIds = new Set(
        targets.filter((_, i) => results[i].status === "fulfilled").map((p) => p.id),
      );
      const failedCount = results.length - succeededIds.size;

      setPreviews((prev) =>
        prev.filter((p) => {
          if (succeededIds.has(p.id)) {
            URL.revokeObjectURL(p.url);
            return false;
          }
          return true;
        }),
      );

      if (failedCount === 0) {
        notifySuccess(`${targets.length} foto(s) subida(s)`);
      } else {
        // GUI-FE-11e (G-MEC-04): mensaje genérico en español (sin el texto
        // técnico crudo del storage/edge function) + severidad warning.
        const firstError = results.find((r) => r.status === "rejected");
        notifyError({
          error: firstError && firstError.status === "rejected" ? firstError.reason : new Error("upload_failed"),
          title: "No se pudieron subir las fotos",
          description: `${failedCount} foto(s) fallaron y se conservan abajo para reintentar. Revisa tu conexión; si el problema continúa, intenta con fotos más ligeras.`,
          severity: "warning",
        });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
          isDragReject
            ? "border-destructive bg-destructive/5"
            : isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
        )}
      >
        <input {...getInputProps()} capture="environment" />
        <div className="flex flex-col items-center gap-2">
          <div className={cn(
            "rounded-full p-3 transition-colors",
            isDragActive ? "bg-primary/10" : "bg-muted"
          )}>
            {isDragActive ? (
              <UploadIcon className="h-6 w-6 text-primary" />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">
              {isDragActive ? "Suelta las fotos aquí" : "Arrastra fotos o toca para abrir cámara"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              PNG, JPG, WebP — máx. {maxFiles} archivos
            </p>
          </div>
        </div>
      </div>

      {previews.length > 0 && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {previews.map((p, i) => (
              <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                <img src={p.url} alt={`Vista previa ${i + 1}`} className="w-full h-full object-cover" />
                <Button
                  type="button"
                  variant="secondary"
                  size="iconSm"
                  onClick={() => removePreview(i)}
                  aria-label={`Quitar foto ${i + 1}`}
                  className="absolute top-1 right-1 rounded-full bg-background/80 hover:bg-background opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                >
                  <X className="text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            onClick={handleUploadAll}
            disabled={uploading}
            className="w-full"
          >
            {uploading ? <SpinnerIcon className="animate-spin" /> : <UploadIcon />}
            {uploading ? "Subiendo…" : `Subir ${previews.length} foto(s)`}
          </Button>
        </>
      )}
    </div>
  );
}
