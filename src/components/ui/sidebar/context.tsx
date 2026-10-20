import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, ComponentProps, Ref } from "react";
import { useIsCompactDesktop, useIsTabletOrBelow } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { restoreModalFocus } from "@/lib/ui/restoreModalFocus";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_ICON,
} from "./constants";

export type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean, options?: { restoreFocus?: boolean }) => void;
  restoreMobileFocus: (event: Event) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  triggerId: string;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

export const SidebarProvider = ({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ref,
  ...props
}: ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  ref?: Ref<HTMLDivElement>;
}) => {
  const triggerId = useId();
  const isMobile = useIsTabletOrBelow();
  const isCompactDesktop = useIsCompactDesktop();
  const [openMobile, _setOpenMobile] = useState(false);
  const shouldRestoreMobileFocus = useRef(true);
  const setOpenMobile = useCallback((next: boolean, { restoreFocus = true }: { restoreFocus?: boolean } = {}) => {
    shouldRestoreMobileFocus.current = restoreFocus;
    _setOpenMobile(next);
  }, []);
  const restoreMobileFocus = useCallback((event: Event) => {
    if (!shouldRestoreMobileFocus.current) { event.preventDefault(); return; }
    // Resolve at teardown: responsive headers may remount the opener.
    restoreModalFocus(event, document.querySelector<HTMLButtonElement>(`[data-sidebar-trigger="${triggerId}"]`));
  }, [triggerId]);

  const [_open, _setOpen] = useState(defaultOpen && !isCompactDesktop);
  useEffect(() => {
    // Mantener la elección manual hasta cruzar un breakpoint; el sidebar móvil
    // usa openMobile y no comparte este estado.
    if (openProp === undefined) _setOpen(defaultOpen && !isCompactDesktop);
  }, [defaultOpen, isCompactDesktop, openProp]);
  const open = openProp ?? _open;
  const setOpen = useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open],
  );

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      shouldRestoreMobileFocus.current = true;
      _setOpenMobile((v) => !v);
    } else {
      setOpen((v) => !v);
    }
  }, [isMobile, setOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";

  const contextValue = useMemo<SidebarContextValue>(
    () => ({ state, open, setOpen, isMobile, openMobile, setOpenMobile, restoreMobileFocus, toggleSidebar, triggerId }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, restoreMobileFocus, toggleSidebar, triggerId],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as CSSProperties
          }
          className={cn("group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar", className)}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
};
SidebarProvider.displayName = "SidebarProvider";

