import { ChevronRightIcon, InfoIcon, WarnIcon } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
import type { ReactNode } from "react";

export interface BlockedActionLink {
  label: string;
  /** Ruta interna (usar constantes de `ROUTES`). */
  to: string;
}

interface BlockedActionNoticeProps {
  block: BusinessBlock;
  /** Detalle contextual: folio, descripción del daño, monto, etc. */
  details?: ReactNode;
  /** Acción directa para resolver el bloqueo ("Ver factura", "Resolver daño"). */
  link?: BlockedActionLink;
  className?: string;
}

/**
 * Bloque explicable para una acción de negocio bloqueada.
 *
 * Jerarquía fija: qué está bloqueado → por qué → qué sigue. Usa el tono `info`
 * para restricciones normales del negocio y reserva `warning` para condiciones
 * que sí ameritan atención; nunca expone SQLSTATE ni nombres de restricciones.
 */
export function BlockedActionNotice({ block, details, link, className }: BlockedActionNoticeProps) {
  const navigate = useNavigateTransition();
  const Icon = block.tone === "warning" ? WarnIcon : InfoIcon;

  return (
    <Alert
      variant={block.tone}
      className={className}
      data-testid="blocked-action-notice"
      data-block-code={block.code}
    >
      <Icon className="h-4 w-4" />
      <AlertTitle>{block.action}</AlertTitle>
      <AlertDescription className="space-y-1">
        <p>{block.reason}</p>
        {details && <div className="text-muted-foreground">{details}</div>}
        <p className="text-muted-foreground">{block.nextStep}</p>
        {link && (
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => navigate(link.to)}
          >
            {link.label}
            <ChevronRightIcon className="h-4 w-4 ml-1" />
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
