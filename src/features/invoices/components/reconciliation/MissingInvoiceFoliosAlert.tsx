import { WarnIcon } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";

type MissingInvoiceFoliosAlertProps = {
  count: number;
  preview: readonly string[];
};

export function MissingInvoiceFoliosAlert({
  count,
  preview,
}: MissingInvoiceFoliosAlertProps) {
  if (count <= 0) return null;

  const folioLabel = count === 1 ? "folio interno faltante" : "folios internos faltantes";

  return (
    <Alert>
      <WarnIcon className="h-4 w-4" />
      <AlertDescription>
        <p className="font-medium">
          {count.toLocaleString("es-MX")} {folioLabel} en el rango.
        </p>
        {preview.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer select-none underline underline-offset-4">
              Ver {preview.length.toLocaleString("es-MX")} folio{preview.length === 1 ? "" : "s"}
              {preview.length < count
                ? ` (primeros ${preview.length.toLocaleString("es-MX")} de ${count.toLocaleString("es-MX")})`
                : ""}
            </summary>
            <p className="mt-1 max-h-36 overflow-y-auto break-words text-xs">
              {preview.map((folio) => `FAC-${folio}`).join(", ")}
              {preview.length < count ? ", …" : ""}
            </p>
          </details>
        )}
        <p className="mt-2 text-sm">
          Puede ser normal si esos folios se emitieron fuera del rango, o indicar folios cancelados/eliminados.
        </p>
      </AlertDescription>
    </Alert>
  );
}
