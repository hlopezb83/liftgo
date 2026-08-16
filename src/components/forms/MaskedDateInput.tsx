import { useRef, useState, type KeyboardEvent, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import {
  caretForSegment,
  digitsFromDate,
  digitsOf,
  formatMask,
  MASK_PLACEHOLDER,
  parseMaskedDate,
  segmentAtCaret,
  stepSegment,
  type DateSegment,
} from "@/lib/date/parseMaskedDate";
import { cn } from "@/lib/utils";

export interface MaskedDateInputProps {
  value?: Date;
  onChange: (date?: Date) => void;
  /** Fecha usada por el atajo "hoy" y como base de +/-. Por defecto, hoy local. */
  today?: Date;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /**
   * §3.3 auditoría v2: mismo criterio que el `disabled` del calendario. Si la
   * fecha capturada por teclado cae en el matcher se rechaza (antes solo el
   * calendario respetaba la restricción y el teclado la brincaba, p. ej. la
   * fecha de un pago con REP timbrado).
   */
  isDateDisabled?: (date: Date) => boolean;
  className?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
}

const STEP_KEYS: Record<string, number> = { ArrowUp: 1, "+": 1, ArrowDown: -1, "-": -1 };

/**
 * Input DD/MM/AAAA con captura por teclado numérico.
 *
 * Atajos: `H`/`T` = hoy · `+`/`-` y flechas ↑↓ = ajustan el segmento activo ·
 * flechas ←→ = mueven entre segmentos · `Esc` = limpia.
 */
export function MaskedDateInput({
  value,
  onChange,
  today,
  id,
  placeholder = MASK_PLACEHOLDER,
  disabled,
  isDateDisabled,
  className,
  ...aria
}: MaskedDateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [digits, setDigits] = useState(() => digitsFromDate(value));
  const [error, setError] = useState<string | null>(null);

  // Sincroniza cuando la fecha cambia desde fuera (calendario, reset del form).
  // Excepción: si el usuario está escribiendo (captura parcial o inválida) y el
  // valor externo quedó en `undefined` por nuestro propio aviso, se conserva el
  // texto tecleado y el mensaje de error.
  const typing = digits.length > 0 && digits.length < 8;
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    const next = digitsFromDate(value);
    if (next !== digits && !(value === undefined && typing)) {
      setDigits(next);
      setError(null);
    }
  }

  /**
   * @param final `true` en blur: además avisa de capturas parciales.
   */
  const commit = (next: string, final = false) => {
    setDigits(next);
    const parsed = parseMaskedDate(next);

    // §3.3: fecha completa pero bloqueada por el matcher del calendario.
    if (parsed.date && isDateDisabled?.(parsed.date)) {
      setError("Esta fecha no está permitida");
      onChange(undefined);
      return;
    }

    // §3.4: captura parcial (menos de 8 dígitos). Antes el formulario conservaba
    // en silencio la fecha anterior; ahora se limpia el valor y, al salir del
    // campo, se muestra el aviso.
    if (!parsed.complete) {
      setError(final && next.length > 0 ? "Fecha incompleta (DD/MM/AAAA)" : null);
      onChange(undefined);
      return;
    }

    setError(parsed.error);
    onChange(parsed.date ?? undefined);
  };

  const applyDigits = (next: string) => {
    commit(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) el.setSelectionRange(formatMask(next).length, formatMask(next).length);
    });
  };

  const currentSegment = (): DateSegment =>
    segmentAtCaret(inputRef.current?.selectionStart ?? formatMask(digits).length);

  const moveSegment = (segment: DateSegment) => {
    const pos = caretForSegment(segment, digits);
    inputRef.current?.setSelectionRange(pos, pos);
  };

  const handleStep = (delta: number) => {
    const segment = currentSegment();
    commit(stepSegment(digits, segment, delta, today ?? new Date()));
    requestAnimationFrame(() => moveSegment(segment));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const key = e.key;
    if (key in STEP_KEYS) {
      e.preventDefault();
      handleStep(STEP_KEYS[key]);
      return;
    }
    if (key === "h" || key === "H" || key === "t" || key === "T") {
      e.preventDefault();
      applyDigits(digitsFromDate(today ?? new Date()));
      return;
    }
    if (key === "Escape" && digits.length > 0) {
      e.preventDefault();
      applyDigits("");
      return;
    }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const segment = currentSegment();
      const next = key === "ArrowLeft" ? segment - 1 : segment + 1;
      if (next >= 0 && next <= 2) {
        e.preventDefault();
        moveSegment(next as DateSegment);
      }
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    applyDigits(digitsOf(e.target.value));
  };

  return (
    <>
      <Input
        ref={inputRef}
        id={id}
        value={formatMask(digits)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(digits, true)}
        placeholder={placeholder}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        className={cn("font-mono tabular-nums", error && "border-destructive", className)}
        {...aria}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </>
  );
}
