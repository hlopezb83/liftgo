import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { describeElement, type SelectedElementInfo } from "../lib/cssPath";

interface Props {
  onPick: (info: SelectedElementInfo, rawEl: Element) => void;
  onCancel: () => void;
}

/** Overlay full-screen que destaca el elemento bajo el cursor y lo captura al hacer click. */
export function ElementPicker({ onPick, onCancel }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [label, setLabel] = useState<string>("");
  const targetRef = useRef<Element | null>(null);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.closest("[data-element-picker-overlay]")) return;
      targetRef.current = el;
      setRect(el.getBoundingClientRect());
      const tag = el.tagName.toLowerCase();
      const txt = (el.textContent || "").trim().slice(0, 60);
      setLabel(txt ? `${tag} · "${txt}"` : tag);
    };

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = targetRef.current;
      if (!el || el.closest("[data-element-picker-overlay]")) return;
      onPick(describeElement(el), el);
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };

    document.addEventListener("mousemove", handleMove, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("mousemove", handleMove, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [onPick, onCancel]);

  return createPortal(
    <div data-element-picker-overlay className="fixed inset-0 z-[9999] pointer-events-none">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto bg-foreground text-background text-sm px-4 py-2 rounded-md shadow-lg">
        Haz clic en el elemento del problema · ESC para cancelar
      </div>
      {rect && (
        <>
          <div
            className="absolute border-2 border-primary bg-primary/10 transition-all duration-75"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }}
          />
          {label && (
            <div
              className="absolute bg-primary text-primary-foreground text-xs px-2 py-1 rounded font-mono whitespace-nowrap max-w-xs truncate"
              style={{
                left: rect.left,
                top: Math.max(0, rect.top - 24),
              }}
            >
              {label}
            </div>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
