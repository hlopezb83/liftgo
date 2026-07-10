/**
 * Wrapper sobre `supabase.functions.invoke` que extrae el cuerpo JSON real
 * de los errores de Edge Functions.
 *
 * El SDK de Supabase envuelve cualquier respuesta no-2xx en un
 * `FunctionsHttpError` cuyo `message` es siempre el string genérico
 * "Edge Function returned a non-2xx status code". El cuerpo real
 * (ej. `{ error: "Invoice already stamped" }`) queda atrapado en
 * `error.context` (una `Response`). Este helper lo lee y lo expone como
 * mensaje del `Error` lanzado, preservando el original en `cause`.
 */
import { supabase } from "@/integrations/supabase/client";

type InvokeBody = Parameters<typeof supabase.functions.invoke>[1] extends infer O
  ? O extends { body?: infer B } ? B : never
  : never;

export interface InvokeEdgeOptions {
  body?: InvokeBody;
  headers?: Record<string, string>;
}

export async function invokeEdgeFunction<T = unknown>(
  name: string,
  options: InvokeEdgeOptions = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, options);

  if (error) {
    const message = await extractErrorMessage(error);
    const wrapped = new Error(message);
    (wrapped as Error & { cause?: unknown }).cause = error;
    throw wrapped;
  }

  if (
    data &&
    typeof data === "object" &&
    !(data instanceof Blob) &&
    !(data instanceof ArrayBuffer) &&
    "error" in data &&
    (data as { error?: unknown }).error
  ) {
    const raw = (data as { error: unknown }).error;
    throw new Error(typeof raw === "string" ? raw : JSON.stringify(raw));
  }

  return data as T;
}

function getFallbackMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  const msg = (error as { message?: unknown })?.message;
  return typeof msg === "string" ? msg : "Edge Function error";
}

function pickErrorField(parsed: Record<string, unknown>): string | null {
  const candidate = parsed.error ?? parsed.message ?? parsed.detail;
  if (typeof candidate === "string" && candidate.length > 0) return candidate;
  if (candidate) return JSON.stringify(candidate);
  return null;
}

async function extractErrorMessage(error: unknown): Promise<string> {
  const fallback = getFallbackMessage(error);
  const ctx = (error as { context?: unknown }).context;
  if (!ctx || typeof (ctx as Response).clone !== "function") return fallback;

  try {
    const text = await (ctx as Response).clone().text();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return pickErrorField(parsed) ?? fallback;
    } catch {
      return text.slice(0, 500);
    }
  } catch {
    return fallback;
  }
}
