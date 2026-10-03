import { initClientSentry } from "./lib/observability/sentry";

// Importar primero desde client.ts y conservar este efecto en package.sideEffects.
initClientSentry();
