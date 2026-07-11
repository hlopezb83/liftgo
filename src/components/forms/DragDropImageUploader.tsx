import { useCallback, useState } from "react";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { useDropzone } from "react-dropzone";
import { useUploadDocument } from "@/hooks/useDocuments";
import { Upload, X, Loader2, ImageIcon } from "@/components/icons";

import { cn } from "@/lib/utils";

interface DragDropImageUploaderProps {
  entityType: string;
  entityId: string;
  maxFiles?: number;
  className?: string;
}

export function DragDropImageUploader({ entityType, entityId, maxFiles = 10, className }: DragDropImageUploaderProps) {
  const uploadDoc = useUploadDocument();
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newPreviews = acceptedFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPreviews((prev) => [...prev, ...newPreviews].slice(0, maxFiles));
  }, [maxFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".heic"] },
    maxFiles,
    multiple: true,
  });

  const removePreview = (index: number) => {
    setPreviews((prev) => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleUploadAll = async () => {
    if (previews.length === 0) return;
    setUploading(true);
    try {
      for (const { file } of previews) {
        await uploadDoc.mutateAsync({ file, entityType, entityId });
      }
      notifySuccess(`${previews.length} foto(s) subida(s)`);
      previews.forEach((p) => URL.revokeObjectURL(p.url));
      setPreviews([]);
    } catch (err) {
      notifyError({ error: err, message: "Error al subir fotos" });
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
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
        )}
      >
        <input {...getInputProps()} capture="environment" />
        <div className="flex flex-col items-center gap-2">
          <div className={cn(
            "rounded-full p-3 transition-colors",
            isDragActive ? "bg-primary/10" : "bg-muted"
          )}>
            {isDragActive ? (
              <Upload className="h-6 w-6 text-primary" />
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
              <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                <img src={p.url} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePreview(i)}
                  className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleUploadAll}
            disabled={uploading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Subiendo..." : `Subir ${previews.length} foto(s)`}
          </button>
        </>
      )}
    </div>
  );
}
