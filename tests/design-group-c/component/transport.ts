import type { BrowserContext } from "@playwright/test";
import { componentOrigin } from "../paths";

/** Supplemental comparison only: data hooks, permissions and navigation are
 * synthetic. Only the enumerated local Vite assets may reach a server. */
export async function installComponentTransport(context: BrowserContext) {
  const unexpected: string[] = [];
  const externalBlocked: string[] = [];
  const observed: string[] = [];
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
    const response = await route.fetch({ maxRedirects: 0 });
    if (response.status() >= 300 && response.status() < 400) {
      unexpected.push(`Redirect ${description}`);
      return route.abort();
    }
    observed.push(description);
    return route.fulfill({ response });
  });
  return { unexpected, externalBlocked, observed };
}
