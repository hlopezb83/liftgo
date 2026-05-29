## Objetivo
Eliminar mezclas español/inglés en strings visibles. El caso reportado: el toast dice "Cotización marcada como accepted" porque interpola el status crudo de la BD (en inglés) dentro de un texto en español.

## Plan

### 1. Corregir los toasts con status interpolado (inmediato)
En estos archivos el patrón es `\`X marcada como ${status}\`` con `status` crudo:
- `src/features/quotes/hooks/quoteDetail/useQuoteConversionActions.ts` — usar `quoteStatusLabel(status)` (ya existe en `src/features/quotes/constants.ts`).
- `src/features/contracts/hooks/contractDetail/useContractDetailLogic.ts` — usar la etiqueta localizada de status de contrato (revisar `STATUS_LABELS` en `src/lib/constants.ts`).
- `src/features/invoices/hooks/invoiceDetail/useInvoiceDetailActions.ts` — usar etiqueta localizada de status de factura.

### 2. Búsqueda amplia con dos agentes en paralelo
- **Agente A — Toasts y mensajes runtime**: buscar todos los `toast.success/error/info/warning`, `notifyError`, `notifySuccess`, `sonner` calls que interpolen variables con valores enum/status crudos (ej. `accepted`, `pending`, `draft`, `sent`, `completed`, `cancelled`, `paid`, `open`, `closed`). Reportar archivo, línea, snippet y corrección sugerida (label localizado).
- **Agente B — UI estática y formularios**: buscar strings hardcodeados en inglés dentro de componentes (`.tsx`), placeholders, labels, headers de tabla, validation messages de Zod, botones, títulos de diálogos. Excluir: nombres de variables, comentarios, `console.log`, archivos de tipos generados (`integrations/supabase/types.ts`), librerías ui shadcn intactas.

Cada agente entrega una tabla concisa: `archivo:línea | string actual | español sugerido`.

### 3. Aplicar correcciones de los agentes
Revisar los reportes, priorizar por visibilidad al usuario (toasts > diálogos > placeholders > labels secundarios), y aplicar en lote. Si hay >20 cambios, agruparlos por módulo.

### 4. Changelog
Versión patch `6.14.3`: "Localización: se eliminan mezclas español/inglés en toasts y UI" con detalle por módulo afectado.

## Notas técnicas
- Los labels canónicos viven en `src/features/quotes/constants.ts` (`quoteStatusLabel`), `src/lib/constants.ts` (`STATUS_LABELS`) y por dominio en sus `constants`. Reutilizar, no duplicar.
- No se tocan valores en BD ni enums Postgres — solo presentación.