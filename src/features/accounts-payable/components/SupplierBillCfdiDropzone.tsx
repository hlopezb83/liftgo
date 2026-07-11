import { useRef, useState } from "react";
import { FileUp, Loader2, CheckCircle2, AlertCircle, X } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ImportedCfdi } from "../hooks/useImportSupplierBillCfdi";

interface Props {
  busy: boolean;
  error: string | null;
  result: ImportedCfdi | null;
  onFile: (file: File) => void;
  onClear: () => void;
}

export function SupplierBillCfdiDropzone({ busy, error, result, onFile, onClear }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (result) {
    return (
      <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
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
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        disabled={busy}
        className={`w-full rounded-md border-2 border-dashed px-4 py-3 transition-colors flex items-center justify-center gap-2 ${
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/60"
        } ${busy ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
      >
        {busy
          ? <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          : <FileUp className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm">
          {busy ? "Procesando XML…" : "Arrastra un XML CFDI o haz clic para autocompletar (opcional)"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xml,application/xml,text/xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No se pudo importar</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
