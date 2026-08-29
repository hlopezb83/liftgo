import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { businessBlockSummary, type BusinessBlock } from "@/lib/rules/businessBlocks";
import type { ComponentProps, ReactNode } from "react";

type ButtonProps = ComponentProps<typeof Button>;

interface BlockedActionButtonProps extends Omit<ButtonProps, "disabled"> {
  /** Bloqueo de negocio vigente; `null` habilita el botón. */
  block: BusinessBlock | null;
  /** Deshabilitado por otra razón (mutación en curso, etc.). */
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Botón que permanece visible cuando el estado del negocio bloquea la acción,
 * en vez de desaparecer: se muestra deshabilitado y explica el motivo en un
 * tooltip. Los permisos insuficientes se siguen manejando con `RoleGuard`
 * (esos sí se ocultan).
 */
export function BlockedActionButton({
  block,
  disabled,
  children,
  ...buttonProps
}: BlockedActionButtonProps) {
  const button = (
    <Button
      {...buttonProps}
      disabled={disabled || block !== null}
      aria-describedby={block ? `block-${block.code}` : undefined}
    >
      {children}
    </Button>
  );

  if (!block) return button;

  return (
    // Provider local: el componente debe funcionar en cualquier árbol (el
    // provider global de la app sigue aplicando, anidarlos es seguro).
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* `span` porque un botón deshabilitado no emite eventos de puntero. */}
          <span className="inline-flex" data-block-code={block.code}>
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent id={`block-${block.code}`} className="max-w-xs">
          {businessBlockSummary(block)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
