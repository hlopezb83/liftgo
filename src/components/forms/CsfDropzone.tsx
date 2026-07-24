import { useCallback, useState } from "react";
import { ErrorCode, useDropzone, type FileRejection } from "react-dropzone";
import { UploadIcon, DocumentIcon, SpinnerIcon, SuccessIcon } from "@/components/icons";
import { useParseCsf, type ParsedCsfData } from "@/features/customers";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { cn } from "@/lib/utils";

interface Props<T> {
  /** Receives the mapped patch plus the original File for later upload. */
  onParsed: (patch: Partial<T>, file: File) => void;
  /** Maps the raw CSF parser output to the form-specific shape. */
  mapData: (data: ParsedCsfData) => Partial<T>;
}

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** Mensaje user-facing en español para cada ErrorCode nativo de la librería. */
function messageFor(rejection: FileRejection): string {
  const code = rejection.errors[0]?.code;
  switch (code) {
    case ErrorCode.FileInvalidType:
      return "Solo se aceptan archivos PDF";
    case ErrorCode.FileTooLarge:
      return "El archivo no debe superar 10 MB";
    case ErrorCode.TooManyFiles:
      return "Sólo puedes subir un archivo a la vez";
    default:
      return "Archivo no válido";
  }
}

/**
 * Generic CSF (Constancia de Situación Fiscal) PDF dropzone.
 * Shared across Cliente / Proveedor dialogs to keep one visual language.
 *
 * v16: la validación de tipo/tamaño se delega a `accept` + `maxSize` y los
 * rechazos se manejan con `onDropRejected` + `ErrorCode` tipado (no más checks
 * a mano). `isDragReject` da feedback visual cuando arrastras algo inválido.
 */
export function CsfDropzone<T>({ onParsed, mapData }: Props<T>) {
  const parseCsf = useParseCsf();
  const parsing = parseCsf.isPending;
  const [parsed, setParsed] = useState(false);

  const onDropAccepted = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setParsed(false);
      parseCsf.mutate(file, {
        onSuccess: (data) => {
          onParsed(mapData(data), file);
          setParsed(true);
          notifySuccess("Datos fiscales extraídos. Revisa y completa la información.");
        },
        onError: (e: unknown) => {
          notifyError({ error: e, message: "Error al procesar la constancia" });
        },
      });
    },
    [parseCsf, onParsed, mapData],
  );

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const first = rejections[0];
    if (first) notifyValidation({ message: messageFor(first) });
  }, []);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDropAccepted,
    onDropRejected,
    accept: { "application/pdf": [".pdf"] },
    maxSize: MAX_SIZE_BYTES,
    maxFiles: 1,
    multiple: false,
    disabled: parsing,
  });

  if (parsed) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <SuccessIcon className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Datos extraídos correctamente</p>
          <p className="text-xs text-muted-foreground">Revisa y completa los campos faltantes antes de guardar.</p>
        </div>
        <DocumentIcon className="h-5 w-5 text-muted-foreground shrink-0" />
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
        isDragReject
          ? "border-destructive bg-destructive/5"
          : isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50",
        parsing && "pointer-events-none opacity-60",
      )}
      aria-label="Zona para subir Constancia de Situación Fiscal (PDF)"
    >
      <input {...getInputProps()} />
      {parsing ? (
        <div className="flex flex-col items-center gap-3">
          <SpinnerIcon className="h-10 w-10 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Extrayendo datos fiscales…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <UploadIcon className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {isDragReject
                ? "Formato no válido — solo PDF"
                : "Arrastra tu CSF aquí o haz clic para seleccionar"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Constancia de Situación Fiscal del SAT (PDF, máx. 10 MB)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
