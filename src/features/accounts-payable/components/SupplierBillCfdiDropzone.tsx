import { useDropzone } from "react-dropzone";
import { FileUp, SpinnerIcon, SuccessIcon, InfoAlertIcon, X } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ImportedCfdi } from "../hooks/useImportSupplierBillCfdi";

interface Props {
  busy: boolean;
  error: string | null;
  result: ImportedCfdi | null;
  onFile: (file: File) => void;
  onClear: () => void;
}

/**
 * Dropzone para autocompletar la factura de proveedor a partir de un CFDI XML.
 *
 * v16: se sustituyó la reimplementación manual (onDragOver/onDrop + useState
 * `dragging` + <input type="file" hidden>) por `useDropzone`, que ya provee
 * `isDragActive`, accesibilidad por teclado (`role="button"`, foco visible),
 * y validación de tipo con `accept`. El pipeline visual se conserva 1:1.
 */
export function SupplierBillCfdiDropzone({ busy, error, result, onFile, onClear }: Props) {
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDropAccepted: (files) => {
      const file = files[0];
      if (file) onFile(file);
    },
    accept: {
      "application/xml": [".xml"],
      "text/xml": [".xml"],
    },
    maxFiles: 1,
    multiple: false,
    disabled: busy,
    noClick: false,
    noKeyboard: false,
  });

  if (result) {
    return (
      <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <SuccessIcon className="h-4 w-4 text-success shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">CFDI cargado</p>
            <p className="text-xs text-muted-foreground font-mono truncate">
              UUID {result.parsed.uuid}
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClear} className="shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        {...getRootProps({
          className: cn(
            "w-full rounded-md border-2 border-dashed px-4 py-3 transition-colors flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary",
            isDragReject
              ? "border-destructive bg-destructive/5"
              : isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/30 hover:border-primary/60",
            busy ? "opacity-60 cursor-wait" : "cursor-pointer",
          ),
        })}
        aria-label="Zona para importar CFDI XML"
      >
        <input {...getInputProps()} />
        {busy ? (
          <SpinnerIcon className="h-4 w-4 text-muted-foreground animate-spin" />
        ) : (
          <FileUp className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm">
          {busy
            ? "Procesando XML…"
            : isDragReject
              ? "Formato no válido — solo XML"
              : isDragActive
                ? "Suelta el XML aquí"
                : "Arrastra un XML CFDI o haz clic para autocompletar (opcional)"}
        </span>
      </div>
      {error && (
        <Alert variant="destructive">
          <InfoAlertIcon className="h-4 w-4" />
          <AlertTitle>No se pudo importar</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
