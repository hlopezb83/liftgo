

## Cambiar etiqueta "Enviado" → "Sin Pagar"

### Cambio

**Archivo: `src/lib/constants.ts`**

En el objeto `STATUS_LABELS`, cambiar:
```typescript
sent: "Enviado",
// →
sent: "Sin Pagar",
```

Un solo cambio en una línea. Al estar centralizado en `constants.ts`, se reflejará automáticamente en toda la app (StatusBadge, filtros, tablas, portal, etc.).

