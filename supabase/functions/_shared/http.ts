// Helpers HTTP compartidos para Edge Functions. Consolidan las respuestas JSON
// + headers CORS para evitar el drift entre funciones (algunas olvidaban CORS
// en respuestas de error, otras duplicaban `Content-Type`).
import { getCorsHeaders } from "./cors.ts";

export function jsonResponse(
  req: Request,
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  const cors = getCorsHeaders(req);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function jsonError(
  req: Request,
  status: number,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse(req, { error: message, ...extra }, { status });
}
