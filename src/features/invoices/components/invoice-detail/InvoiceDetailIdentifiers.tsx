import { useState } from "react";
import { SuccessIcon, DuplicateIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { copyWithFeedback } from "@/lib/ui/copyWithFeedback";

interface Props {
  cfdiUuid: string | null;
  serie: string | null;
  folio: string | null;
  isStamped?: boolean;
}

interface RowProps {
  label: string;
  tooltip: string;
  value: string | null;
  placeholder?: string;
}

function IdRow({ label, tooltip, value, placeholder = "— pendiente de timbrado —" }: RowProps) {
  const [copied, setCopied] = useState(false);
  const isEmpty = !value;

  const copy = async () => {
    if (!value) return;
    if (!await copyWithFeedback(value, label, "Copiado al portapapeles")) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-1.5 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0 sm:max-w-[45%]">
        <span className="text-sm text-muted-foreground">{label}</span>
        {/* V07/V10: explicación visible, sin depender de hover. */}
        <p className="text-xs text-muted-foreground">{tooltip}</p>
      </div>
      <div className="flex min-w-0 items-start gap-2 sm:items-center">
        <span
          className={`min-w-0 break-all select-all font-mono text-sm ${isEmpty ? "text-muted-foreground italic" : ""}`}
          title={value ?? undefined}
        >
          {value ?? placeholder}
        </span>
        {!isEmpty && (
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={copy} aria-label={`Copiar ${label}`}>
            {copied ? <SuccessIcon className="h-3.5 w-3.5 text-success" /> : <DuplicateIcon className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Muestra los identificadores fiscales de una factura timbrada:
 * - Folio fiscal SAT (UUID)
 * - Serie y folio de Facturapi
 */
export function InvoiceDetailIdentifiers({ cfdiUuid, serie, folio, isStamped }: Props) {
  const stamped = isStamped ?? Boolean(cfdiUuid);
  const serieFolio = serie && folio ? `Serie ${serie} · Folio ${folio}` : null;
  const serieFolioPlaceholder = stamped
    ? "— no informado por Facturapi —"
    : "— pendiente de timbrado —";

  return (
    <Card>
      {/* V07/V10: sección compacta desplegable nativa (teclado y táctil). */}
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-4 py-2 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>Identificadores</span>
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">Mostrar UUID, serie y folio</span>
          <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Ocultar</span>
        </summary>
      <div className="divide-y px-4 pb-3">
        <IdRow
          label="Folio fiscal SAT (UUID)"
          tooltip="Identificador oficial ante el SAT (36 caracteres). Se asigna al timbrar y es distinto del folio interno."
          value={cfdiUuid}
        />
        <IdRow
          label="Serie y folio de Facturapi"
          tooltip="Serie y folio devueltos por Facturapi. El ERP conserva estos valores para identificar el comprobante; son distintos del UUID."
          value={serieFolio}
          placeholder={serieFolioPlaceholder}
        />
      </div>
      </details>
    </Card>
  );
}
