import type { ComponentProps } from "react";
import { useTheme } from "next-themes";
// eslint-disable-next-line no-restricted-imports -- Toaster de shadcn: único componente autorizado a montar el <Toaster/> de sonner.
import { Toaster as Sonner } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToastDialogInset } from "@/lib/ui/useToastDialogInset";

type ToasterProps = ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();
  useToastDialogInset(isMobile);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position={isMobile ? "top-center" : "bottom-right"}
      containerAriaLabel="Notificaciones"
      style={{ "--width": "400px" } as ToasterProps["style"]}
      // R7-FE-09c (N7-POR-06): el toast top-center se solapaba con el header
      // sticky (h-14 = 56px) en móvil; 64px lo coloca justo debajo.
      // BL-R8-10: en móvil sonner usa `mobileOffset` (default 16px) con
      // precedencia sobre `offset` (--mobile-offset-top > --offset-top en el
      // DOM), así que el fix r7 quedó incompleto — hay que fijar ambos.
      offset={isMobile ? 64 : undefined}
      mobileOffset={{ top: "calc(64px + env(safe-area-inset-top))", left: 16, right: 16, bottom: "calc(24px + env(safe-area-inset-bottom))" }}
      closeButton
      toastOptions={{
        closeButtonAriaLabel: "Cerrar notificación",
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-success",
          warning: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-warning",
          error: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-destructive",
          // GUI-FE-10: botón de cierre del toast con área táctil ≥44px.
          closeButton:
            "group-[.toast]:min-h-11 group-[.toast]:min-w-11 group-[.toast]:flex group-[.toast]:items-center group-[.toast]:justify-center",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
