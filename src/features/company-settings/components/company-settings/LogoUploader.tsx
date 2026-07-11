import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UploadIcon, DeleteIcon, ImageIcon } from "@/components/icons";
import { useUploadCompanyLogo } from "../../hooks/useUploadCompanyLogo";

interface Props {
  logoUrl: string;
  onChange: (url: string) => void;
}

export function LogoUploader({ logoUrl, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useUploadCompanyLogo();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await upload(file);
    if (url) onChange(url);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <Label>Logo de la Empresa (opcional)</Label>
      <div className="flex items-center gap-4">
        {logoUrl ? (
          <div className="relative h-16 w-16 rounded-md border border-border overflow-hidden bg-muted flex items-center justify-center">
            <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
          </div>
        ) : (
          <div className="h-16 w-16 rounded-md border border-dashed border-border bg-muted flex items-center justify-center">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleUpload}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <UploadIcon className="h-4 w-4 mr-1" />
            {uploading ? "Subiendo..." : "Subir Logo"}
          </Button>
          {logoUrl && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")} className="text-destructive hover:text-destructive">
              <DeleteIcon className="h-4 w-4 mr-1" /> Eliminar
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">JPG, PNG, WebP o SVG. Máximo 2MB.</p>
    </div>
  );
}
