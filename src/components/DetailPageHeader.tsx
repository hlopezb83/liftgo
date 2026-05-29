import { ReactNode, Children, isValidElement } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MoreVertical } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DetailPageHeaderProps {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  backTo: string;
  actions?: ReactNode;
  /** Acción primaria que se mantiene visible en móvil. Las demás se colapsan al menú. */
  primaryAction?: ReactNode;
}

export function DetailPageHeader({ title, subtitle, badges, backTo, actions, primaryAction }: DetailPageHeaderProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

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
        <Button variant="ghost" size="icon" onClick={handleBack} className="touch:h-11 touch:w-11 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-muted-foreground truncate">{subtitle}</p>}
          {badges && <div className="flex items-center gap-2 flex-wrap mt-1">{badges}</div>}
        </div>
      </div>
      {hasActions && (
        <div className="flex gap-2 flex-wrap justify-end items-center">
          {primaryAction}
          {actions}
        </div>
      )}
    </div>
  );
}
