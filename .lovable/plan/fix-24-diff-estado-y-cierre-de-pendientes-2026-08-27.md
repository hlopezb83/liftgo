# fix-24.diff — estado y cierre de pendientes

Este paquete ya se aplicó casi por completo en la versión 7.354.0. Verifiqué punto por punto contra el código y la base de datos; quedan tres detalles abiertos.

## Ya aplicado (verificado)

- **R4-20 — Seed sin admin automático**: `supabase/seed.sql` ya usa el GUC `app.seed_admin_email` con avisos cuando no está definido o el correo no existe.
- **R4-21 (parcial)**: `company_settings.allow_e2e_seed` ya tiene valor por omisión `false`.
- **R4-28 (parcial)**: existe la política de borrado en el bucket `payment-proofs` y el límite de 10 MB por archivo.
- **R4-33**: `invite-user` y `validate-supplier-rep` ya devuelven mensajes genéricos y registran el detalle solo en el log.
- **R4-32**: la facturación recurrente ya distingue "sin tarifa configurada" de "tarifa 0 pactada".

## Pendientes propuestos

1. **Apagar el sembrado E2E en la fila existente (R4-21)**: hoy la configuración de la empresa todavía tiene el sembrado de datos de prueba activado; solo se cambió el valor por omisión. Se apaga en la fila actual, como pide el diff.
2. **Restringir tipos de archivo en comprobantes de pago (R4-28)**: el bucket acepta cualquier tipo de archivo. Se limitará a PDF, JPEG, PNG y WebP, que es exactamente lo que ya acepta la pantalla de carga.
3. **Rol del portal en el sembrado E2E (R4-21)**: aquí propongo mantener la diferencia deliberada respecto al diff. El diff elimina por completo la asignación del rol de cliente, pero la app enruta el portal según ese rol (`AuthGuard`), así que las pruebas del portal dejarían de funcionar. La versión actual solo asigna el rol cuando la cuenta no tiene ningún rol previo, lo que ya cierra el riesgo de degradar una cuenta de personal. Se documenta la desviación y no se cambia.

## Detalles técnicos

- Punto 1: `UPDATE public.company_settings SET allow_e2e_seed = false WHERE allow_e2e_seed` mediante la herramienta de datos (no es cambio de esquema).
- Punto 2: `allowed_mime_types` no se puede fijar por migración (los `UPDATE` sobre `storage.buckets` se rechazan) y la herramienta de buckets solo expone tamaño y visibilidad. Se implementará la validación de tipo en el flujo de carga (`useCreatePaymentIntent.ts`) reforzando la lista blanca y rechazando cualquier otro tipo antes de subir, y se dejará anotado el límite pendiente a nivel de bucket.
- Punto 3: solo comentario en la función `e2e_seed_portal_scenario` y nota en la memoria de seguridad; sin cambio funcional.
- Cierre: bump a **7.354.1** (patch), entrada de changelog, y verificación con Vitest + `deno check/lint/fmt`.
