import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { BackIcon } from "@/components/icons";

interface DetailPageHeaderProps {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  backTo: string;
  actions?: ReactNode;
  /** Acción primaria, se muestra primero en la barra de acciones. */
  primaryAction?: ReactNode;
}

export function DetailPageHeader({ title, subtitle, badges, backTo, actions, primaryAction }: DetailPageHeaderProps) {
  const navigate = useNavigateTransition();

  const handleBack = () => {
    const savedParams = sessionStorage.getItem(`list-filters:${backTo}`);
    navigate(savedParams ? `${backTo}?${savedParams}` : backTo);
  };


  // Nota: `actions` suele venir como un único componente wrapper, por lo que
  // contar Children no es confiable. Apilamos siempre que haya acciones para
  // evitar que compitan con el título y se trunque.
  const hasActions = Boolean(actions);

  return (
    <div className={hasActions ? "flex flex-col gap-3" : "flex items-center gap-2"}>
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Volver" className="touch:h-11 touch:w-11 shrink-0">
          <BackIcon className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight line-clamp-2">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{subtitle}</p>}
          {badges && <div className="flex items-center gap-2 flex-wrap mt-1">{badges}</div>}
        </div>
      </div>
      {hasActions && (
        <div className="flex gap-2 flex-wrap items-center pl-10 sm:pl-12">
          {primaryAction}
          {actions}
        </div>
      )}
    </div>
  );
}
