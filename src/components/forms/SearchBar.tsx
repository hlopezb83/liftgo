import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { SearchIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";


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
  "data-testid": testId,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(value);
  const debounced = useDebouncedValue(local, debounceMs);

  // Sincroniza valor externo (reset, limpieza programática) con estado local.
  useEffect(() => {
    setLocal(value);
  }, [value]);

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

  return (
    <div className={`relative flex-1 ${className}`}>
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        className={captureCtrlK ? "pl-9 pr-16" : "pl-9"}
        data-testid={testId}
      />
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
