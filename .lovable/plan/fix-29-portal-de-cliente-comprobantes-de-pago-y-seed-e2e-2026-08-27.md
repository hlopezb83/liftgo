# fix-29: portal de cliente, comprobantes de pago y seed E2E

Verifiqué los cinco hallazgos contra la base actual. Cuatro son bugs reales; uno lo recomiendo descartar.

## Qué se corrige

### R5-06 — El seed E2E puede borrar pagos reales del cliente (real, alta)
La función de datos de prueba del portal borra sólo clientes/facturas marcados como prueba, pero los borrados de "reportes de pago" y "pagos" apuntan a **todas** las facturas de ese cliente, incluidas las reales.
Corrección: acotar esos borrados a facturas marcadas como prueba.

### R5-08a — Un cliente puede registrar un comprobante apuntando a la carpeta de otro (real, media)
La regla de acceso al crear un reporte de pago no valida que la ruta del comprobante esté dentro de la carpeta del propio cliente.
Corrección: exigir que la primera carpeta de la ruta sea el id del cliente.

### R5-08b — Borrado de comprobantes bloqueado por datos de otros clientes (real, media)
La regla de borrado cruza reportes de pago de **cualquier** cliente, así que un archivo propio pendiente puede quedar imborrable por un registro ajeno.
Corrección: acotar la verificación a los reportes del mismo cliente.

### R5-12 — Sobrepago por reportes simultáneos (real, media)
Al validar el monto de un reporte de pago no se bloquea la factura, así que dos envíos al mismo tiempo pueden sumar más que el saldo.
Corrección: bloquear la fila de la factura (`FOR UPDATE`) antes de calcular el saldo disponible.

### R5-19 — Límites del bucket de comprobantes (real, baja)
El bucket es privado (bien), pero el límite quedó en 10,000,000 bytes y **sin** lista de tipos permitidos: hoy se puede subir cualquier formato.
Corrección: límite 10 MB (10,485,760) y whitelist PDF/PNG/JPEG/WebP, alineada con la validación del cliente. Se aplica con la herramienta de buckets (no por migración, que está prohibida para `storage.buckets`).

## Qué recomiendo NO aplicar

### R5-07 — Apagar `allow_e2e_seed` globalmente
En v7.356.1 se decidió lo contrario a propósito: el valor por defecto para entornos nuevos ya es `false`, y este entorno de desarrollo/pruebas lo tiene encendido porque la suite E2E lo necesita (`tests/e2e/global.setup.ts` lo vuelve a encender de todas formas). Aplicarlo rompería CI sin ganar seguridad. Si prefieres aplicarlo igual, dímelo.

## Detalles técnicos

- Migración 1: `CREATE OR REPLACE public.e2e_seed_portal_scenario` con `AND is_e2e = true` en los subselects de `customer_payment_intents` y `payments`; se conservan guards de admin, `allow_e2e_seed` y `SET search_path`.
- Migración 2: recrear policy INSERT `Customers create own payment intents` añadiendo `(proof_url IS NULL OR (storage.foldername(proof_url))[1] = customer_id::text)`, y recrear la policy DELETE de `storage.objects` con `cpi.customer_id = get_customer_id_for_user((select auth.uid()))` dentro del `NOT EXISTS`. Se usa `(select auth.uid())` en ambas.
- Migración 3: `CREATE OR REPLACE public.validate_payment_intent_amount()` con `SELECT i.total ... FOR UPDATE`; resto de la lógica de saldo sin cambios.
- Bucket `payment-proofs`: `file_size_limit = 10485760`, `allowed_mime_types = [application/pdf, image/png, image/jpeg, image/webp]`.
- Versionado: v7.359.0 en `package.json`, `CHANGELOG.md`, `public/changelog.json` y `public/changelog/v7.359.0.json`.
- Verificación: linter de seguridad, `bunx vitest run` y build.
