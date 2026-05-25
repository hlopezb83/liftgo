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

  const actionChildren = Children.toArray(actions).filter(isValidElement);
  const collapseToMenu = isMobile && actionChildren.length > 1;

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <Button variant="ghost" size="icon" onClick={handleBack} className="touch:h-11 touch:w-11 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-muted-foreground truncate">{subtitle}</p>}
          {badges && <div className="flex items-center gap-2 flex-wrap mt-1">{badges}</div>}
        </div>
      </div>
      {actions && (
        collapseToMenu ? (
          <div className="flex items-center gap-2 shrink-0">
            {primaryAction}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="touch:h-11 touch:w-11" aria-label="Más acciones">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="flex flex-col gap-1 p-2 min-w-[12rem]">
                {actionChildren}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap shrink-0">{actions}</div>
        )
      )}
    </div>
  );
}
