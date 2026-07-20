import { useEffect, useRef, useState } from "react";
import type { ChangelogIndexEntry } from "../lib/changelog";

/**
 * Handles /changelog#v5.43.2 deep-linking: expands the matching entry,
 * scrolls to it, and applies a temporary highlight ring.
 */
export function useChangelogDeepLink(changelog: ChangelogIndexEntry[]) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || changelog.length === 0) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith("v")) return;
    const version = hash.slice(1);
    if (!changelog.some((e) => e.version === version)) return;
    handled.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- inicialización única desde
    // window.location.hash: es un efecto legítimo porque depende de una API del navegador.
    setExpanded((prev) => new Set(prev).add(version));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario anterior.
    setHighlighted(version);
    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`v${version}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    const highlightTimer = window.setTimeout(() => setHighlighted(null), 2500);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [changelog]);

  const toggle = (version: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  return { expanded, highlighted, toggle };
}
