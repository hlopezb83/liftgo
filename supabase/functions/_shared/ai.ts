// Shared helper for Lovable AI Gateway (chat completions).
// Centraliza URL, headers, manejo de 429/402/5xx y parsing de tool_calls.
// Documentación: MP-A1 del reporte de auditoría — envío de datos fiscales a IA externa.

const AI_ENDPOINT = Deno.env.get("AI_GATEWAY_ENDPOINT") ??
  "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export interface AiTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface AiChatOptions {
  model: string;
  messages: AiMessage[];
  tools?: AiTool[];
  toolChoice?: { type: "function"; function: { name: string } };
  responseFormat?: { type: "json_object" };
  temperature?: number;
  maxTokens?: number;
}

export interface AiChatResult {
  raw: unknown;
  text: string | null;
  toolArguments: Record<string, unknown> | null;
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

/**
 * Llama al gateway de IA. Retorna texto y (si aplica) argumentos del tool_call.
 * Lanza AiGatewayError con `status` mapeable a la respuesta HTTP de la Edge Function.
 */
export async function aiChatCompletion(
  opts: AiChatOptions,
): Promise<AiChatResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    throw new AiGatewayError(500, "LOVABLE_API_KEY no configurada");
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
  };
  if (opts.tools) body.tools = opts.tools;
  if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  if (opts.responseFormat) body.response_format = opts.responseFormat;
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (typeof opts.maxTokens === "number") body.max_tokens = opts.maxTokens;

  const resp = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    if (resp.status === 429) {
      throw new AiGatewayError(
        429,
        "Demasiadas solicitudes, intenta de nuevo en un momento.",
        errText,
      );
    }
    if (resp.status === 402) {
      throw new AiGatewayError(
        402,
        "Créditos insuficientes para el servicio de IA.",
        errText,
      );
    }
    throw new AiGatewayError(
      500,
      "Error al procesar la solicitud con IA",
      errText,
    );
  }

  const data = await resp.json();
  const message = data?.choices?.[0]?.message ?? {};
  const text: string | null = typeof message.content === "string"
    ? message.content
    : null;
  const toolCall = message.tool_calls?.[0];
  let toolArguments: Record<string, unknown> | null = null;
  if (toolCall?.function?.arguments) {
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      if (parsed && typeof parsed === "object") {
        toolArguments = parsed as Record<string, unknown>;
      }
    } catch {
      toolArguments = null;
    }
  }

  return { raw: data, text, toolArguments };
}
