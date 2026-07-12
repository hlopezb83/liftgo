import { useEffect, useState } from "react";
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** True cuando el viewport es < 768px (móvil). */
export function useIsMobile(): boolean {
  return useMatchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}

/** True cuando el viewport es < 1024px (móvil o tablet). */
export function useIsTabletOrBelow(): boolean {
  return useMatchMedia(`(max-width: ${TABLET_BREAKPOINT - 1}px)`);
}
