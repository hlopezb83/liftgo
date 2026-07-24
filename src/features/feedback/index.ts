// Barrel público de la feature "feedback".
// Re-exporta la API consumida por otras features.
// v7.218.0 · ARQ2-L7: NO re-exportamos páginas — rompe code-splitting cuando
// MainLayout importa el barrel para hooks/utilidades.
export * from "./components/FeedbackFab";
// v7.218.0 · ARQ2-A5: exponer helpers de mensajes al público.
export * from "./lib/feedbackMessages";
