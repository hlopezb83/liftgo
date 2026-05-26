// Helpers de coerción para form prefill. Reduce complejidad ciclomática
// en mappers donde cada `||` cuenta como rama (regla Power-of-10 #1).

export const toStr = (v: unknown, fallback = ""): string =>
  v === null || v === undefined ? fallback : String(v);

export const toNumStr = (v: unknown, fallback = ""): string => {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
};

export const orEmpty = <T>(v: T | null | undefined, fallback: T): T =>
  v === null || v === undefined ? fallback : v;
