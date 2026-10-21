# MEJ008: consulta del excedente y su origen (YAGNI)

Alcance acordado: sólo mostrar el excedente observado de una factura y los
documentos que lo originan. Sin aplicaciones entre facturas, compensaciones,
devoluciones, tablas, RPC, permisos nuevos ni infraestructura para flujos
futuros. No queda un compromiso de implementar esas funciones.

Base: `24082043f`. Cambio exclusivamente local de lectura/presentación; no
migraciones, backfill, cobros, bancos, timbrados ni modificaciones de saldos.

## Ecuación y fuentes

`computeInvoiceCreditBalance` recibe los documentos ya autorizados y cargados
por el detalle de una factura. La página espera pagos/NC y bloquea el detalle
si fallan esas consultas. No se agregan hooks ni nuevas consultas.

- Cobrado: cada pago convertido y redondeado a centavos de la moneda de factura,
  reutilizando `convertCurrencyAmount` y `sumMoney`, compatibles con MEJ005.
- NC vigente: timbrada, no cancelada y sin cancelación aceptada. Una cancelación
  pendiente sigue vigente; un borrador no reduce el importe.
- Neto facturado = total − NC vigentes, una sola vez.
- Excedente observado = máximo(cobrado − neto facturado, 0).

Ejemplo: factura 100 y NC 30, sin pagos → excedente 0. Con pago 70 → 0; pago
80 → 10; pago 100 → 30. NC total sin pago → 0. No se trata una NC como un cobro
ni se inserta un pago para simular una aplicación. Se conservan los balances,
estados, reportes de efectivo y documentos fiscales existentes.

El detalle muestra el excedente, factura, pagos con fecha/referencia/moneda/TC
y conversión, folios de NC vigentes y UUID REP cuando ya existe. Conserva los
IDs de factura/cliente/empresa en la proyección y no agrega importes de otras
facturas, clientes, empresas o monedas. No clasifica anticipos ni asigna formas
SAT a estos importes.

En misma moneda no hace falta TC para conocer el excedente en esa moneda; la
ausencia del TC a MXN se conserva. Un pago cruzado sin TC bloquea la cifra
completa, no se interpreta como cero ni como conversión 1:1.

La tarjeta explica que es información de los documentos actuales, no un saldo
disponible para aplicar, y no registra cobros, aplicaciones o devoluciones.
No hay botones deshabilitados ni anuncios de funciones futuras. Se retira el
aviso anterior que prometía aplicar el importe a futuras facturas.

## Integridad y permisos

Sin ACL/RLS/roles/RPC/columnas nuevas ni ampliación de acceso. Se usan los mismos
datos y permisos del detalle existente; no se habilitan finanzas a dispatcher.
No se añaden acciones de escritura para operadores, auditores ni clientes.

Falla cerrado ante importes no finitos/negativos/fuera del rango entero de
centavos, NC mayor al total, NC en otra moneda, documentos de otra factura o
cliente y fuentes duplicadas. Facturas en borrador/canceladas no se presentan
como saldo disponible. El backend/RLS sigue siendo la autoridad del alcance.

El portal no recibe cambios: su RPC actual no expone todas las señales de FX
faltante/documentos necesarias para esta cifra. No se añade una cifra inferida
al cliente desde un contrato incompleto ni se amplía su acceso para obtenerla.

La consulta se recalcula al cambiar pagos/NC. No es una bitácora inmutable y no
pretende representar operaciones de aplicación/reversión, que no existen.

## Diferencia preexistente: cancelación NULL

La vista histórica `v_invoices_with_balance` usa `cancellation_status <> 'accepted'`,
que excluye NULL por semántica SQL. El detalle y `sync_invoice_status` (0116)
tratan NULL como no aceptada. Se reprodujo la diferencia en PostgreSQL efímero;
no se verificó el SQL remoto ni la existencia de datos afectados.

La tarjeta NO consume esa vista: `deriveInvoiceData` en `InvoiceDetail.tsx`
usa `usePayments(id)` y `useCreditNotesForInvoice(id)` tanto para el saldo
visible como para esta proyección. Los dos aplican el mismo criterio NULL
vigente y conversión. Ejemplo 100/pago100/NC30 con NULL: detalle −30, excedente
30, sin contradicción local. No se añade una advertencia artificial por una
vista distinta ni se presenta el importe como saldo global verificado. Los
tests mantienen NULL activo y NC sin efectivo → excedente cero.

Fuentes inspeccionadas:

- `supabase/migrations/20260901181755_c5d18503-1938-4abb-a1d1-3bf9e8ac896d.sql`
- `drizzle/migrations/0103_canonical_payment_invoice_currency.sql`
- `drizzle/migrations/0116_invoice_settlement_reconciliation.sql`
- `src/features/invoices/pages/InvoiceDetail.tsx`
- `supabase/functions/stamp-payment-complement/handler.ts`

El REP actual depende de un `payment_id` real. No se cambia ese contrato ni se
inventa un pago/compensación. Lo anterior es descripción técnica, no asesoría
fiscal ni una selección de comprobante/forma SAT.

## Pruebas y límites

Pruebas de dominio/UI cubren NC sola/total, pagos parciales, NC canceladas y
borradores, cancelación pendiente y NULL, fuentes duplicadas o de otro ámbito,
FX faltante, importes inválidos, origen/TC, actualización y ausencia de controles
de mutación. Los tests de detalle conservan su espera/error antes de mostrar
saldos. No cambia la lógica de pago, permisos, timbrado o navegación existente.

Once casos compartidos con PostgreSQL verifican centavos y conversión contra
los helpers FX reales extraídos de migraciones y una referencia SQL explícita
de la ecuación. No son pruebas de un ledger, RLS nuevo ni replay del esquema.
El launcher sólo acepta su cluster loopback propio, verifica `data_directory`,
crea una base vacía aparte y detiene el cluster. No .env, URL remota ni proveedor.

Reproducción:

```sh
node node_modules/vitest/vitest.mjs run src/features/invoices/lib/__tests__/invoiceCreditBalance.test.ts src/features/invoices/components/invoice-detail/__tests__/InvoiceCreditBalanceCard.test.tsx src/features/invoices/pages/__tests__/InvoiceDetailBalance.test.tsx src/features/invoices/lib/__tests__/paymentCurrency.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit -p scripts/tests/fiscal/tsconfig.json
RUN_LOCAL_FISCAL_TESTS=1 PG_BIN=/trusted/postgresql/bin node scripts/tests/fiscal/run-rep-postgres.mjs
```

La revisión independiente y validación global se realizan sobre el bloque
integrado. No se afirma QA de navegador en la aplicación publicada.

Validación local 2026-10-21 UTC:

- Estado final de dominio/tarjeta/detalle: 55/55 pruebas (39 + 6 + 10).
- Regresiones focales de navegación, permisos NC y FX: 23/23; la corrida previa
  de seis archivos pasó 76/76 antes de dos controles adicionales de trazabilidad.
- PostgreSQL efímero: 12/12 controles MEJ008 y 11/11 REP existentes; cluster
  detenido correctamente. No se aplicó ninguna migración a un servicio remoto.
- Tipos de helper/tarjeta/tests y suite fiscal: pasan. Lint de todos los archivos
  UI tocados y `git diff --check`: pasan.
- Typecheck global/build/suite completa y QA publicada no ejecutados en este
  worktree; los gates de integración son responsabilidad del integrador.
