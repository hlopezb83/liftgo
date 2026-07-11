/**
 * Barrel de schemas Zod compartidos. Todo consumidor debería importar desde
 * `@/lib/schemas` en lugar de subarchivos concretos, para permitir
 * subdividir (`fiscal.ts`, `money.ts`, etc.) sin romper imports.
 */
export * from "./common";
