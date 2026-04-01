

## Configurar zona horaria de Monterrey (America/Monterrey)

### Problema
La app no tiene una zona horaria configurada explícitamente. Las fechas usan `new Date()` que toma la zona del navegador/servidor, lo cual puede ser inconsistente.

### Solución

**1. `src/lib/config.ts`** — Agregar constante de timezone:
```ts
TIMEZONE: "America/Monterrey",
```

**2. `src/lib/utils.ts`** — Crear helper `nowLocal()` que retorne la fecha/hora en zona Monterrey usando `date-fns-tz`:
```ts
import { toZonedTime } from "date-fns-tz";
export function nowMty(): Date {
  return toZonedTime(new Date(), APP_CONFIG.TIMEZONE);
}
```
Y actualizar `formatDateDisplay` para usar la zona configurada.

**3. Archivos que usan `new Date()` para mostrar fechas** — Reemplazar con `nowMty()`:
- `src/lib/contractPdfGenerator.ts` (2 ocurrencias)
- `src/lib/quotePdfPremium.ts` (1 ocurrencia)
- Componentes de actividad reciente y timestamps que formatean fechas

**4. `src/components/ui/calendar.tsx`** — Ya usa locale `es`, no requiere cambios.

**5. `src/lib/changelog.ts`** — Agregar entrada v5.10.4 con el fix de timezone.

### Dependencia
- Instalar `date-fns-tz` (complemento de `date-fns` ya instalado).

### Archivos modificados
- `src/lib/config.ts`
- `src/lib/utils.ts`
- `src/lib/contractPdfGenerator.ts`
- `src/lib/quotePdfPremium.ts`
- `src/lib/changelog.ts`

