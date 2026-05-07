## Problema

La contraseña `Ep@1234567890` cumple con los requisitos visuales (mayúscula, número, símbolo, ≥8 chars) pero Supabase Auth la rechaza porque el sufijo `1234567890` está en listas de contraseñas filtradas/predecibles (HIBP + heurística interna). El mensaje actual confunde al usuario porque sugiere agregar más complejidad, cuando el problema real es que el patrón es **predecible/filtrado**.

## Causa técnica

En `supabase/functions/reset-user-password/index.ts` mapeamos el error de Supabase así:

- Si contiene `"pwned"` o `"leaked"` → mensaje de filtración
- Si contiene `"weak"` → mensaje genérico de complejidad

Supabase devuelve literal: `"Password is known to be weak and easy to guess"` — contiene `"weak"`, así que cae en el mensaje de complejidad aunque la causa real sea predictibilidad.

## Plan

1. **Mejorar el mapeo de errores en la edge function** (`reset-user-password/index.ts`):
   - Detectar también `"easy to guess"` y `"known to be"` y tratarlos como contraseña comprometida/predecible (no como falta de complejidad).
   - Texto nuevo: *"Esta contraseña es predecible o aparece en filtraciones públicas conocidas. Aunque cumpla con mayúsculas/números/símbolos, evita secuencias comunes (1234567890, qwerty, fechas, etc.). Usa 'Generar contraseña segura'."*

2. **Mejorar la ayuda en el diálogo** (`SetPasswordDialog.tsx`):
   - Agregar línea bajo el input: *"Evita secuencias comunes como `1234567890` o `qwerty` aunque incluyan símbolos — Supabase las rechaza por estar en listas de filtraciones."*

3. **Changelog** v5.59.14 (patch): documentar el ajuste de mensajería.

## Sin cambios de lógica de negocio

No se modifica la política de validación de contraseñas (sigue siendo HIBP del lado de Supabase). Solo se mejora la comunicación del error al admin.
