import { useCallback, useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useParseCsf } from "@/features/customers/hooks/useParseCsf";
import type { CustomerFormData } from "@/features/customers/lib/customerFormSchema";

interface Props {
  onParsed: (patch: Partial<CustomerFormData>) => void;
}

export function CsfDropzone({ onParsed }: Props) {
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
        onParsed({
          name: data.name || undefined,
          rfc: data.rfc || undefined,
          domicilio_fiscal_cp: data.domicilio_fiscal_cp || undefined,
          address: data.address || undefined,
          regimen_fiscal: data.regimen_fiscal || undefined,
          representante_legal: data.representante_legal || undefined,
        });
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
