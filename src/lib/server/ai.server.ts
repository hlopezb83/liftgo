/**
 * Cliente del gateway de IA (chat completions), portado de
 * `supabase/functions/_shared/ai.ts` al runtime de TanStack Start.
 * Mismos timeouts, mismo mapeo de errores 429/402/5xx.
 */

interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export interface AiChatOptions {
  model: string;
  messages: AiMessage[];
  responseFormat?: { type: "json_object" };
  temperature?: number;
  maxTokens?: number;
}

export interface AiChatResult {
  raw: unknown;
  text: string | null;
}

export class AiGatewayError extends Error {
  constructor(
    public status: number,
    message: string,
    public bodyText?: string,
  ) {
    super(message);
    this.name = "AiGatewayError";
  }
}

function buildRequestBody(opts: AiChatOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
  };
  if (opts.responseFormat) body["response_format"] = opts.responseFormat;
  if (typeof opts.temperature === "number") body["temperature"] = opts.temperature;
  if (typeof opts.maxTokens === "number") body["max_tokens"] = opts.maxTokens;
  return body;
}

async function postToGateway(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new AiGatewayError(
        504,
        "El servicio de clasificación no respondió; intenta de nuevo",
      );
    }
    throw new AiGatewayError(
      502,
      "No se pudo contactar el servicio de IA",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Mismo mapeo de errores 429/402/5xx que la Edge Function original. */
async function throwGatewayError(resp: Response): Promise<never> {
  const errText = await resp.text().catch(() => "");
  const messages: Record<number, string> = {
    429: "Demasiadas solicitudes, intenta de nuevo en un momento.",
    402: "Créditos insuficientes para el servicio de IA.",
  };
  const message = messages[resp.status];
  if (message) throw new AiGatewayError(resp.status, message, errText);
  throw new AiGatewayError(500, "Error al procesar la solicitud con IA", errText);
}

export async function aiChatCompletion(
  opts: AiChatOptions,
): Promise<AiChatResult> {
  const endpoint = process.env["AI_GATEWAY_ENDPOINT"] ??
    "https://ai.gateway.lovable.dev/v1/chat/completions";
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new AiGatewayError(500, "LOVABLE_API_KEY no configurada");
  }

  const resp = await postToGateway(endpoint, apiKey, buildRequestBody(opts));
  if (!resp.ok) await throwGatewayError(resp);

  const data = await resp.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = data?.choices?.[0]?.message?.content;
  return { raw: data, text: typeof content === "string" ? content : null };
}
