import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function useUploadCompanyLogo() {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File): Promise<string | null> => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El archivo no debe superar 2MB");
      return null;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten archivos de imagen");
      return null;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `company/logo_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(filePath);
      toast.success("Logo subido correctamente");
      return urlData.publicUrl;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al subir logo");
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}
