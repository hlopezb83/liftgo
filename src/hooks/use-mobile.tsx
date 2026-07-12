import { useMediaQuery } from "usehooks-ts";

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

/** True cuando el viewport es < 768px (móvil). */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`, { initializeWithValue: false });
}

/** True cuando el viewport es < 1024px (móvil o tablet). */
export function useIsTabletOrBelow(): boolean {
  return useMediaQuery(`(max-width: ${TABLET_BREAKPOINT - 1}px)`, { initializeWithValue: false });
}
