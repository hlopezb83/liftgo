# F11 — Centralizar el umbral de saldo proyectable

Verificado: `src/features/cash-flow/lib/cashFlowTransformers.ts` repite el literal `0.005` en dos guards (líneas 91 y 118), uno en `invoiceToItem` y otro en `billToItem`. Los demás `0.005` del repo pertenecen a otros dominios (máximo acreditable en notas de crédito, tolerancia de balance reportable en el portal) y no se tocan.

## Cambio

Declarar una constante privada del módulo con documentación de intención:

```ts
const MIN_PROJECTABLE_BALANCE_MXN = 0.005;
```

y usarla en ambos guards. Mismo valor, mismas condiciones: refactor de nombre sin cambio de comportamiento.

## Detalles técnicos

- Archivo único: `src/features/cash-flow/lib/cashFlowTransformers.ts`.
- Constante sin export (privada del módulo), colocada antes de `invoiceToItem`.
- Sin pruebas nuevas: `cashFlowTransformers.test.ts` y `billToItem.test.ts` ya ejercen ambos guards con el umbral.
- Cierre: typecheck, ESLint sin advertencias, suite completa y entrada de changelog **v7.328.1** (patch) con sincronización de `package.json` y `version.json`.
