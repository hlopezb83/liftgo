// Helpers compartidos para tests Deno de Edge Functions.
// Fallback a la URL pública del proyecto para que CI no requiera secretos:
// los smoke tests validan CORS preflight y respuestas 401 sin exponer datos.
export const SUPABASE_URL =
  Deno.env.get("VITE_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL") ??
  "https://zxefrzfaynnfwazqhwxp.supabase.co";

export const fnUrl = (name: string): string => `${SUPABASE_URL}/functions/v1/${name}`;
