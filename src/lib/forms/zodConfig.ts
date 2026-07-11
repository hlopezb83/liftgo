/**
 * Configuración global de Zod 4 para toda la app.
 *
 * Aplica el locale español built-in de Zod para mensajes de error base
 * ("Required", "Invalid input", etc.) traducidos automáticamente. Los
 * mensajes específicos de dominio siguen viniendo de cada schema
 * (p.ej. "Selecciona un proveedor", "RFC inválido").
 *
 * Importar UNA sola vez desde `main.tsx` (side-effect import).
 */
import { z } from "zod";

z.config(z.locales.es());
