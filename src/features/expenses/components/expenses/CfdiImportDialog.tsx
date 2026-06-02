import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Upload, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import type { CfdiParseResult, CfdiPrefill } from "@/features/expenses/lib/cfdiPrefill";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (prefill: CfdiPrefill) => void;
}

export function CfdiImportDialog({ open, onOpenChange, onParsed }: Props) {
  const [loading, setLoading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xml")) {
      notifyError({ message: "El archivo debe ser un XML del CFDI" });
      return;
    }
    if (file.size > 1024 * 1024) {
      notifyError({ message: "El XML excede 1MB" });
      return;
    }
    setLoading(true);
    try {
      const xml = await file.text();
      const { data, error } = await supabase.functions.invoke<CfdiParseResult>(
        "parse-cfdi-expense",
        { body: { xml } },
      );
      if (error) throw error;
      if (!data) throw new Error("Respuesta vacía");
      if (data.duplicate) {
        toast.warning("Este CFDI ya fue registrado anteriormente");
        onOpenChange(false);
        return;
      }
      onParsed(data);
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo procesar el CFDI";
      notifyError({ message: msg });
    } finally {
      setLoading(false);
    }
  }, [onParsed, onOpenChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "text/xml": [".xml"], "application/xml": [".xml"] },
    multiple: false,
    disabled: loading,
    onDrop: (files) => { if (files[0]) void handleFile(files[0]); },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Gasto desde CFDI</DialogTitle>
          <DialogDescription>
            Sube el XML de tu factura. Extraeremos automáticamente monto, fecha, proveedor y sugeriremos una categoría con IA.
          </DialogDescription>
        </DialogHeader>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <input {...getInputProps()} />
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Analizando CFDI…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Upload className="h-8 w-8" />
              <p className="text-sm font-medium text-foreground">
                {isDragActive ? "Suelta el archivo aquí" : "Arrastra el XML o haz clic para seleccionar"}
              </p>
              <p className="text-xs">Solo archivos .xml · máx. 1MB</p>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
          <FileText className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Detectamos duplicados automáticamente por UUID del CFDI. Si el proveedor no existe, podrás crearlo desde el formulario.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
