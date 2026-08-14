import { ReactNode } from "react";
import { BackIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { readSessionParams } from "@/hooks/filters/sessionStorage";

interface DetailPageHeaderProps {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  backTo: string;
  actions?: ReactNode;
  /** Acción primaria, se muestra primero en la barra de acciones. */
  primaryAction?: ReactNode;
}

/**
 * v7.302.2: el regreso pasa a ser un botón con etiqueta ("← Volver") en su
 * propio renglón, igual que en `FormPageHeader`, para que detalle y edición se
 * lean como la misma familia y el título quede alineado con las tarjetas.
 */
export function DetailPageHeader({ title, subtitle, badges, backTo, actions, primaryAction }: DetailPageHeaderProps) {
  const navigate = useNavigateTransition();

  const handleBack = () => {
    // F4: reutiliza el guard try/catch centralizado en sessionStorage.ts.
    const savedParams = readSessionParams(backTo).toString();
    navigate(savedParams ? `${backTo}?${savedParams}` : backTo);
  };

  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        aria-label="Volver"
        className="-ml-2 h-7 px-2 text-muted-foreground hover:text-foreground touch:h-9"
      >
        <BackIcon className="h-3.5 w-3.5 mr-1" />
        Volver
      </Button>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="min-w-0 lg:flex-1">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight line-clamp-2">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{subtitle}</p>}
          {badges && <div className="flex items-center gap-2 flex-wrap mt-1">{badges}</div>}
        </div>
        {(primaryAction || actions) && (
          <div className="shrink-0 flex gap-2 flex-wrap items-center">
            {primaryAction}
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
