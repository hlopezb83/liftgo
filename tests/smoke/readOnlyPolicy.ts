/** Shared, fail-closed policy for the local build and public deployment smoke. */
export const PUBLISHED_APP_ORIGIN = "https://liftgo.lovable.app";
const DOCUMENTS = new Set(["/", "/auth", "/portal/login"]);
const PUBLIC_ASSETS = new Set(["/favicon.png", "/favicon.ico", "/brand/liftgo-montacargas.png"]);
const BUNDLE_ASSET = /^\/assets\/[a-zA-Z0-9_.-]+\.(?:m?js|css|png|jpe?g|webp|svg|ico|woff2?|ttf|otf)$/;

export interface SmokeRequest {
  url: string;
  method: string;
  resourceType: string;
}

export function allowReadOnlyRequest(request: SmokeRequest, origin: string): boolean {
  if (!["GET", "HEAD"].includes(request.method)) return false;
  try {
    const url = new URL(request.url);
    if (url.origin !== origin || url.username || url.password || url.search) return false;
    if (request.resourceType === "document") return DOCUMENTS.has(url.pathname);
    return BUNDLE_ASSET.test(url.pathname) || PUBLIC_ASSETS.has(url.pathname) || url.pathname === "/version.json";
  } catch {
    return false;
  }
}

/** HTTP 200 containing a fallback HTML document is not a valid JS/CSS asset. */
export function responseProblem(url: string, status: number, contentType: string): string | undefined {
  const path = new URL(url).pathname;
  if (status < 200 || status >= 300) return `${path}: HTTP ${status} (redirects are not followed)`;
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  let valid = true;
  if (/\.m?js$/.test(path)) valid = /^(?:text|application)\/(?:javascript|ecmascript)$/.test(mime);
  else if (path.endsWith(".css")) valid = mime === "text/css";
  else if (path.endsWith(".json")) valid = mime === "application/json";
  else if (/\.(?:png|jpe?g|webp|svg|ico)$/.test(path)) valid = mime.startsWith("image/");
  else if (DOCUMENTS.has(path)) valid = mime === "text/html";
  return valid ? undefined : `${path}: unexpected Content-Type ${contentType || "(missing)"}`;
}
