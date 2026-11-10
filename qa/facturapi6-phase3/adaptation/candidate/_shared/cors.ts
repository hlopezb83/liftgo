// CORS interno sin env/top-level Deno; NO es autorización.
export function getCorsHeaders(_req: Request): Record<string, string> { return {}; }
export function handleCors(_req: Request): Response | null { return null; }
