import { ReactNode, useRef, useState, TouchEvent, MouseEvent } from "react";
import { type LucideIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface SwipeAction {
  label: string;
  icon: LucideIcon;
  /** Color de fondo del botón. Usa tokens semánticos (ej: "bg-destructive"). */
  className: string;
  onAction: () => void;
}

interface SwipeableCardProps {
  children: ReactNode;
  /** Acciones reveladas al hacer swipe hacia la izquierda (deslizar dedo de derecha a izquierda). */
  rightActions?: SwipeAction[];
  /** Umbral en px para revelar acciones. */
  threshold?: number;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * Tarjeta con swipe-to-reveal para acciones rápidas en móvil.
 * Sigue patrones nativos iOS/Android: deslizar a la izquierda revela
 * acciones secundarias en el lado derecho.
 */
export function SwipeableCard({ children, rightActions = [], threshold = 60, disabled, onClick }: SwipeableCardProps) {
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const swipingRef = useRef(false);
  const [translateX, setTranslateX] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const actionsWidth = rightActions.length * 80;

  const isInteractive = !disabled && rightActions.length > 0;

  const handleTouchStart = (e: TouchEvent) => {
    if (!isInteractive) return;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    swipingRef.current = false;
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isInteractive || startXRef.current === null || startYRef.current === null) return;
    const dx = e.touches[0].clientX - startXRef.current;
    const dy = e.touches[0].clientY - startYRef.current;
    // Solo activar swipe horizontal claro (evita conflicto con scroll vertical)
    if (!swipingRef.current && Math.abs(dx) > Math.abs(dy) + 6) {
      swipingRef.current = true;
    }
    if (!swipingRef.current) return;
    const base = revealed ? -actionsWidth : 0;
    const next = Math.min(0, Math.max(-actionsWidth - 20, base + dx));
    setTranslateX(next);
  };

  const handleTouchEnd = () => {
    if (!isInteractive) return;
    startXRef.current = null;
    startYRef.current = null;
    if (!swipingRef.current) return;
    swipingRef.current = false;
    if (translateX < -threshold) {
      setTranslateX(-actionsWidth);
      setRevealed(true);
    } else {
      setTranslateX(0);
      setRevealed(false);
    }
  };

  const handleClick = (e: MouseEvent) => {
    if (revealed) {
      e.stopPropagation();
      setRevealed(false);
      setTranslateX(0);
      return;
    }
    onClick?.();
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      {rightActions.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex">
          {rightActions.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  a.onAction();
                  setRevealed(false);
                  setTranslateX(0);
                }}
                className={cn(
                  "w-20 flex flex-col items-center justify-center gap-1 text-xs font-medium text-white",
                  a.className,
                )}
                aria-label={a.label}
              >
                <Icon className="h-5 w-5" />
                <span>{a.label}</span>
              </button>
            );
          })}
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        className="relative transition-transform duration-200 ease-out touch-pan-y"
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
