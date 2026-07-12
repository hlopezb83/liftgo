import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";


export function useUploadCompanyLogo() {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File): Promise<string | null> => {
    if (file.size > 2 * 1024 * 1024) {
      notifyValidation({ message: "El archivo no debe superar 2MB" });
      return null;
    }
    if (!file.type.startsWith("image/")) {
      notifyValidation({ message: "Solo se permiten archivos de imagen" });
      return null;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `company/logo_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(filePath);
      notifySuccess("Logo subido correctamente");
      return urlData.publicUrl;
    } catch (err: unknown) {
      notifyError({ error: err, message: "Error al subir logo" });
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}
