import { useState } from "react";
import { SuccessIcon, DuplicateIcon, InfoIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm text-muted-foreground shrink-0">{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex min-w-0 items-start gap-2 sm:items-center">
        <span
          className={`min-w-0 break-all font-mono text-sm ${isEmpty ? "text-muted-foreground italic" : ""}`}
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
 * - Serie y Folio del PAC (Facturapi)
 */
export function InvoiceDetailIdentifiers({ cfdiUuid, serie, folio, isStamped }: Props) {
  const stamped = isStamped ?? Boolean(cfdiUuid);
  const serieFolio = serie && folio ? `Serie ${serie} · Folio ${folio}` : null;
  const serieFolioPlaceholder = stamped
    ? "— no informado por el PAC —"
    : "— pendiente de timbrado —";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Identificadores</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        <IdRow
          label="Folio fiscal SAT (UUID)"
          tooltip="Identificador oficial ante el SAT (36 caracteres). Se asigna al timbrar y es distinto del folio interno."
          value={cfdiUuid}
        />
        <IdRow
          label="Serie y Folio"
          tooltip="Serie y número fiscal asignados por el PAC (Facturapi) al timbrar. Útil para cruzar contra su portal. Son distintos del folio interno y del UUID."
          value={serieFolio}
          placeholder={serieFolioPlaceholder}
        />
      </CardContent>
    </Card>
  );
}
