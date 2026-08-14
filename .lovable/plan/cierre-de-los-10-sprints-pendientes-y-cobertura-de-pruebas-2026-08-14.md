# Cierre de los 10 sprints: pendientes y cobertura de pruebas

Revisé el documento de sprints contra el código actual (v7.316.0, 1688 pruebas en verde). Los sprints 1, 2, 4, 5, 6, 7 y 10 están completos. Quedan tres huecos reales y varios fixes sin prueba automatizada.

## Pendientes reales encontrados

1. **Fix 3.2 — Moneda del pago vs. moneda de la factura (no implementado).**
   No existe ninguna función `assert_payment_currency` en las migraciones. Hoy la validación vive solo en la interfaz, así que un pago insertado por un proceso interno puede quedar en moneda distinta a la factura.

2. **Fix 8.5 — Horas extra al cerrar la devolución (no implementado).**
   La función `complete_return_inspection` guarda `hours_used` pero nunca compara contra `max_hours_per_month` ni usa `extra_hour_rate` del contrato. El cargo por horas excedidas se pierde silenciosamente.

3. **Fix 9.3 — Sacar `.env` del repositorio (no aplicable).**
   En esta plataforma el archivo `.env` con las llaves públicas del backend es generado y administrado automáticamente; no se puede eliminar ni ignorar sin romper el arranque. Ya se agregó `.env.example` y las llaves privadas nunca viven ahí. Se documenta como "no aplica" en vez de forzarlo.

## Fixes implementados pero sin prueba automatizada

- Validación del logo (solo PNG/JPG/WebP, máx. 2 MB).
- Límites del importador de estados de cuenta (10 MB / 50,000 líneas).
- Timeout de 20 s del gateway de IA y respuesta 504.
- Blindaje contra inyección de instrucciones en el clasificador de reportes.
- Monto de factura de daño tomado de la base y no del enlace.
- Propagación del error al convertir cotización en reserva.
- Bloqueo del botón de pago cuando hay cancelación SAT pendiente (existe el flag, falta el caso de prueba del botón).

## Trabajo propuesto

### A. Migraciones SQL (cumpliendo las reglas permanentes del proyecto)
- Trigger `BEFORE INSERT OR UPDATE` en `payments` con función `assert_payment_currency()`: `SECURITY DEFINER`, `SET search_path = public`, mensaje de error en español, sin `EXECUTE` para `anon`.
- Redefinir `complete_return_inspection` para calcular el exceso de horas contra el contrato vigente y guardar el cargo sugerido junto con la inspección (sin facturar automáticamente), respetando los guards de rol actuales.
- Suite de smoke SQL `supabase/tests/sprint3_8_cierre_smoke.sql` con ambos casos.

### B. Interfaz
- Banner en la pantalla de devolución: "Exceso de N horas → cargo sugerido $X (facturación manual)".

### C. Pruebas nuevas (TypeScript)
- Validación del logo: tipo inválido, archivo de 3 MB, caso feliz.
- Importador: archivo de 11 MB y archivo de 60,000 líneas rechazados con mensaje.
- Gateway de IA: se aborta a los 20 s y responde 504.
- Clasificador: el texto del usuario queda truncado y encapsulado.
- Reglas de factura: con cancelación SAT pendiente no se muestra el botón de pago y sí el tooltip.
- Daños: el monto viene del registro de la base aunque el enlace traiga otro valor.
- Cotización: el error de conversión se propaga a la interfaz.

### D. Cierre
- Changelog v7.317.0 (entrada en `CHANGELOG.md`, `public/changelog.json` y detalle por versión) y verificación completa: pruebas, tipos y arch-check.

## Detalles técnicos

- El trigger de moneda debe tolerar pagos sin `invoice_id` y facturas sin moneda definida (no bloquear datos históricos).
- El cargo por horas extra se calcula con los meses rentados de la reserva y los campos congelados del contrato al firmar; si el contrato no tiene `extra_hour_rate`, no se sugiere nada.
- Las pruebas de límites de archivo usan objetos `File` simulados por tamaño, sin generar archivos reales.
