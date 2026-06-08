import { useCallback, useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useParseCsf } from "@/features/customers/hooks/useParseCsf";
import type { SupplierForm } from "./supplierFormTypes";

interface Props {
  onParsed: (patch: Partial<SupplierForm>) => void;
}

export function SupplierCsfDropzone({ onParsed }: Props) {
  const parseCsf = useParseCsf();
  const parsing = parseCsf.isPending;
  const [parsed, setParsed] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      notifyError({ message: "Solo se aceptan archivos PDF" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notifyError({ message: "El archivo no debe superar 10 MB" });
      return;
    }

    setParsed(false);
    parseCsf.mutate(file, {
      onSuccess: (data) => {
        const patch: Partial<SupplierForm> = {};
        const name = data.name || data.razon_social;
        if (name) patch.name = name;
        if (data.rfc) patch.rfc = data.rfc;
        if (data.regimen_fiscal) patch.regimen_fiscal = data.regimen_fiscal;
        if (data.address) patch.address = data.address;
        if (data.representante_legal) patch.contact_person = data.representante_legal;
        onParsed(patch);
        setParsed(true);
        toast.success("Datos fiscales extraídos. Revisa y completa la información.");
      },
      onError: (e: unknown) => {
        notifyError({ error: e, message: "Error al procesar la constancia" });
      },
    });
  }, [parseCsf, onParsed]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: parsing,
  });

  if (parsed) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Datos extraídos correctamente</p>
          <p className="text-xs text-muted-foreground">Revisa y completa los campos faltantes antes de guardar.</p>
        </div>
        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
      } ${parsing ? "pointer-events-none opacity-60" : ""}`}
    >
      <input {...getInputProps()} />
      {parsing ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Extrayendo datos fiscales...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Upload className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Arrastra tu CSF aquí o haz clic para seleccionar</p>
            <p className="text-xs text-muted-foreground mt-1">Constancia de Situación Fiscal del SAT (PDF)</p>
          </div>
        </div>
      )}
    </div>
  );
}
