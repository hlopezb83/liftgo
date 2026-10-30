import type { BrowserContext, Page } from "@playwright/test";
import { componentOrigin } from "../paths.ts";

/** Supplemental comparison only: data hooks, permissions and navigation are
 * synthetic. Only the enumerated local Vite assets may reach a server. */
interface ComponentTransportLedger { unexpected: string[]; externalBlocked: string[]; observed: string[]; errors: string[]; }
const contextLedgers = new WeakMap<BrowserContext, ComponentTransportLedger[]>();
const TRANSPORT_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "ABORT_ERR"]);
function transportCause(error: unknown): string {
  if (!error || typeof error !== "object") return "UNKNOWN";
  const fields = error as { code?: unknown; message?: unknown };
  let code: unknown, text: unknown;
  try { code = fields.code; text = fields.message; } catch { return "UNKNOWN"; }
  if (typeof code === "string" && TRANSPORT_CODES.has(code)) return code;
  if (typeof text !== "string") return "UNKNOWN";
  // Classify a bounded first line; never retain messages, stacks, causes or
  // Playwright's call log (which can contain URLs, headers and bodies).
  const message = text.slice(0, 160).split(/\r?\n/, 1)[0]
    .replace(/^route\.(?:fetch|fulfill|abort): /, "");
  if (message === "aborted") return "PW_ABORTED";
  if (/^Timeout \d+ms exceeded\.?$/.test(message) || message === "Request timed out") return "PW_TIMEOUT";
  if (message === "Target page, context or browser has been closed") return "PW_TARGET_CLOSED";
  if (message === "socket hang up") return "PW_SOCKET_HANGUP";
  return /^(?:(?:connect|read|write) )?(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|ABORT_ERR)(?: |$)/.exec(message)?.[1] ?? "UNKNOWN";
}
export function getComponentTransportLedgers(context: BrowserContext): readonly ComponentTransportLedger[] {
  return contextLedgers.get(context) ?? [];
}
export async function installComponentTransport(context: BrowserContext) {
  const unexpected: string[] = [];
  const externalBlocked: string[] = [];
  const observed: string[] = [];
  const errors: string[] = [];
  const captureErrors = (page: Page) => page.on("pageerror", error => errors.push(error.message));
  context.pages().forEach(captureErrors);
  context.on("page", captureErrors);
  await context.routeWebSocket("**/*", socket => socket.close());
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const description = `${request.method()} ${url.origin}${url.pathname}`;
    if (url.origin !== componentOrigin) {
      externalBlocked.push(description);
      return route.abort();
    }
    const allowedAsset = /^\/(?:@vite|@id|@fs|node_modules|src|tests\/design-group-c)(?:\/|$)/.test(url.pathname)
      || url.pathname === "/@react-refresh" || url.pathname === "/favicon.ico";
    const environmentFile = /(?:^|\/)\.(?:env(?:\.|$)|dev\.vars(?:\.|$))/.test(url.pathname);
    if (request.method() !== "GET" || !allowedAsset || environmentFile) {
      unexpected.push(description);
      return route.abort();
    }
    let phase: "fetch" | "fulfill" | "redirect-abort" = "fetch";
    try {
      const response = await route.fetch({ maxRedirects: 0 });
      if (response.status() >= 300 && response.status() < 400) {
        unexpected.push(`Redirect ${description}`);
        phase = "redirect-abort";
        return await route.abort();
      }
      phase = "fulfill";
      await route.fulfill({ response });
      observed.push(description);
    } catch (error) {
      // A rejected handler leaves the intercepted request unresolved. Record
      // the failure for the existing gate and finish the route before teardown.
      errors.push(`Transport failed: ${description} [phase=${phase}; cause=${transportCause(error)}]`);
      try {
        await route.abort();
      } catch (abortError) {
        errors.push(`Transport abort failed: ${description} [phase=abort-failure; cause=${transportCause(abortError)}]`);
      }
    }
  });
  const ledger = { unexpected, externalBlocked, observed, errors };
  const ledgers = contextLedgers.get(context) ?? [];
  ledgers.push(ledger);
  contextLedgers.set(context, ledgers);
  return ledger;
}
