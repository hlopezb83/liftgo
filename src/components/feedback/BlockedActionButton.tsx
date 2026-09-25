import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { businessBlockSummary, type BusinessBlock } from "@/lib/rules/businessBlocks";
import { cn } from "@/lib/utils";

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
 * en vez de desaparecer: marca la acción como inactiva y deja el motivo
 * consultable con foco, clic y tap. Los permisos se manejan con `RoleGuard`
 * (esos sí se ocultan).
 */
export function BlockedActionButton({
  block,
  disabled,
  children,
  ...buttonProps
}: BlockedActionButtonProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const isBlocked = block !== null;

  const button = (
    <Button
      {...buttonProps}
      type={isBlocked ? "button" : buttonProps.type}
      disabled={!isBlocked && disabled}
      data-block-code={block?.code}
      aria-disabled={isBlocked || undefined}
      aria-describedby={isBlocked ? tooltipId : undefined}
      className={cn(buttonProps.className, isBlocked && "cursor-help opacity-50")}
      onClick={isBlocked ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
      } : buttonProps.onClick}
    >
      {children}
    </Button>
  );

  if (!block) return button;

  const summary = businessBlockSummary(block);

  return (
    // Provider local: el componente debe funcionar en cualquier árbol (el
    // provider global de la app sigue aplicando, anidarlos es seguro).
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          {button}
        </TooltipTrigger>
        <TooltipContent id={tooltipId} className="max-w-xs">
          {summary}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
