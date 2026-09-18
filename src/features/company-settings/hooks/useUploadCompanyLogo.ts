import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOGO_BUCKET } from "@/lib/branding/logoSource";
import { organizationStoragePathForSession } from "@/lib/storage/organizationPath";
import {
  notifyError,
  notifySuccess,
  notifyValidation,
} from "@/lib/ui/appFeedback";

export function useUploadCompanyLogo() {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File): Promise<string | null> => {
    if (file.size > 2 * 1024 * 1024) {
      notifyValidation({ message: "El archivo no debe superar 2MB" });
      return null;
    }
    const ALLOWED: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
    if (!ALLOWED[file.type]) {
      notifyValidation({
        message: "Solo se permiten imágenes PNG, JPG o WebP",
      });
      return null;
    }

    setUploading(true);
    try {
      const ext = ALLOWED[file.type];
      const relativePath = `company/logo_${Date.now()}.${ext}`;
      const filePath = await organizationStoragePathForSession(
        supabase,
        relativePath,
      );
      const { error: uploadError } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(filePath, file);
      if (uploadError) throw uploadError;
      notifySuccess("Logo subido correctamente");
      // Multiempresa: se persiste la RUTA, no una URL pública/firmada. La
      // visualización se firma on-demand con la sesión actual (RLS de hoy).
      return filePath;
    } catch (err: unknown) {
      notifyError({ error: err, message: "Error al subir logo" });
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}
