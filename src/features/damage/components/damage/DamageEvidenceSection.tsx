import { useDropzone } from "react-dropzone";
import { UploadIcon, X, ImageIcon } from "@/components/icons";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { DamagePreview } from "../../hooks/useReportDamageForm";

interface Props {
  previews: DamagePreview[];
  onDrop: (files: File[]) => void;
  onRemove: (index: number) => void;
}

export function DamageEvidenceSection({ previews, onDrop, onRemove }: Props) {
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDropAccepted: onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".heic"] },
    maxFiles: 10,
    multiple: true,
  });

  return (
    <div className="space-y-2">
      <Label>Fotos (opcional)</Label>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          isDragReject
            ? "border-destructive bg-destructive/5"
            : isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
        )}
      >
        <input {...getInputProps()} capture="environment" />
        <div className="flex flex-col items-center gap-1.5">
          <div className={cn("rounded-full p-2 transition-colors", isDragActive ? "bg-primary/10" : "bg-muted")}>
            {isDragActive ? <UploadIcon className="h-5 w-5 text-primary" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">
            {isDragActive ? "Suelta las fotos aquí" : "Arrastra fotos o toca para abrir cámara"}
          </p>
        </div>
      </div>

      {previews.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {previews.map((p, i) => (
            <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
              <img src={p.url} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
