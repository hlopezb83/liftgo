import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { CloseIcon, SearchIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";


interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Delay en ms para emitir el onChange. 0 = sin debounce. Default 200ms. */
  debounceMs?: number;
  /**
   * Si es `true`, Ctrl/Cmd+K enfoca este input. Sólo debe habilitarse en un
   * SearchBar por pantalla para evitar colisiones (GlobalSearch ya usa Ctrl+K).
   * Default: false.
   */
  captureCtrlK?: boolean;
  /**
   * V26-04: nombre accesible estable. Si no se pasa, se usa el placeholder del
   * módulo ("Buscar facturas…"), que ya es contextual. El placeholder solo no
   * basta como nombre cuando el campo tiene texto escrito.
   */
  "aria-label"?: string;
  /** `data-testid` opcional para selectors estables en E2E. */
  "data-testid"?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Buscar…",
  className = "max-w-sm",
  debounceMs = 200,
  captureCtrlK = false,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(value);
  const debounced = useDebouncedValue(local, debounceMs);

  // Sincroniza valor externo (reset, limpieza programática) con estado local.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setLocal(value);
  }

  // Emite cambios debounced hacia el padre. `emit` es useEffectEvent →
  // captura siempre el `onChange` y `value` frescos sin refrescar el efecto.
  const emit = useEffectEvent((next: string) => {
    if (next !== value) onChange(next);
  });
  useEffect(() => {
    emit(debounced);
  }, [debounced]);


  useHotkeys(
    "mod+k",
    (e) => {
      e.preventDefault();
      inputRef.current?.focus();
    },
    { enabled: captureCtrlK, enableOnFormTags: true },
  );

  const handleClear = () => {
    setLocal("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && local) {
      e.preventDefault();
      e.stopPropagation();
      handleClear();
    }
  };

  const prClass = captureCtrlK
    ? local ? "pr-24" : "pr-16"
    : local ? "pr-9" : "pr-3";

  return (
    <div className={`relative flex-1 ${className}`}>
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="search"
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cn("pl-9", prClass)}
        data-testid={testId}
      />
      {local ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClear}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground hover:text-foreground rounded-full",
            captureCtrlK ? "right-14" : "right-1.5",
          )}
          aria-label="Limpiar búsqueda"
          title="Limpiar búsqueda"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {captureCtrlK && (
        <Badge
          variant="secondary"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-3xs px-1.5 py-0 font-mono pointer-events-none opacity-60"
        >
          Ctrl+K
        </Badge>
      )}
    </div>
  );
}
