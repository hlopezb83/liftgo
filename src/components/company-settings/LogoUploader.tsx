import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Trash2, ImageIcon } from "lucide-react";

interface Props {
  logoUrl: string;
  onChange: (url: string) => void;
}

export function LogoUploader({ logoUrl, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("El archivo no debe superar 2MB"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten archivos de imagen"); return; }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `company/logo_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(filePath);
      onChange(urlData.publicUrl);
      toast.success("Logo subido correctamente");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al subir logo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
            <Upload className="h-4 w-4 mr-1" />
            {uploading ? "Subiendo..." : "Subir Logo"}
          </Button>
          {logoUrl && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">JPG, PNG, WebP o SVG. Máximo 2MB.</p>
    </div>
  );
}
