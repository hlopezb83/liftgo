import { useTheme } from "next-themes";
import { Moon, Sun } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { isMobile } = useSidebar();
  const isDark = theme === "dark";
  const label = isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro";

  const button = (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );

  // En Sheet mobile/tablet, el auto-focus dispara el tooltip al montar.
  // aria-label + title cubren accesibilidad sin overlay pegado.
  if (isMobile) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{isDark ? "Tema claro" : "Tema oscuro"}</TooltipContent>
    </Tooltip>
  );
}
