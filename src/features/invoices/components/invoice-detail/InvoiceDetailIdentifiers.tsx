import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Copy, Info } from "lucide-react";
import { notifySuccess } from "@/lib/ui/appFeedback";

interface Props {
  invoiceNumber: string;
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
    await navigator.clipboard.writeText(value);
    setCopied(true);
    notifySuccess("Copiado al portapapeles");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm text-muted-foreground shrink-0">{label}</span>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`font-mono text-sm truncate ${isEmpty ? "text-muted-foreground italic" : ""}`}
          title={value ?? undefined}
        >
          {value ?? placeholder}
        </span>
        {!isEmpty && (
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={copy} aria-label={`Copiar ${label}`}>
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Muestra los tres identificadores independientes de una factura:
 * - Folio interno LiftGo (FAC-XXXX)
 * - Folio fiscal SAT (UUID)
 * - Serie y Folio del PAC (Facturapi)
 */
export function InvoiceDetailIdentifiers({ invoiceNumber, cfdiUuid, serie, folio }: Props) {
  const serieFolio = serie && folio ? `Serie ${serie} · Folio ${folio}` : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Identificadores</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        <IdRow
          label="Folio interno"
          tooltip="Control administrativo LiftGo. Se asigna al crear el borrador y nunca cambia, incluso si timbras días después o fuera de orden."
          value={invoiceNumber}
        />
        <IdRow
          label="Folio fiscal SAT (UUID)"
          tooltip="Identificador oficial ante el SAT (36 caracteres). Se asigna al timbrar y es distinto del folio interno."
          value={cfdiUuid}
        />
        <IdRow
          label="Serie y Folio"
          tooltip="Serie y número fiscal asignados por el PAC (Facturapi) al timbrar. Útil para cruzar contra su portal. Son distintos del folio interno y del UUID."
          value={serieFolio}
        />
      </CardContent>
    </Card>
  );
}
