# Paquete 15: separar PortalInvoicePayment

## Implementación
- Crear `PortalInvoicePaymentParts.tsx` con las piezas visuales, helpers puros y tipos auxiliares solicitados.
- Mantener `PortalInvoicePayment.tsx` como orquestador de ruta, consultas, estados de carga/error/no encontrado y `dlgOpen`.
- Conservar exactamente el marcado, textos, clases, accesibilidad, cálculos, bloqueos, navegación, hooks y contratos actuales.
- Añadir una prueba puntual de contrato para proteger la separación y las reglas de pago existentes.

## Validación
- Ejecutar las pruebas relacionadas con portal, facturas y pagos, sin conexiones de escritura a producción.
- Ejecutar ESLint sobre los archivos tocados, `tsgo --noEmit`, `arch:check` y build.
- Si todo pasa, actualizar los cinco artefactos de versión a 8.25.18, preservando el formato del historial completo y las 60 entradas recientes.
- Revisar el diff final y dejar fuera cualquier archivo ajeno al paquete.

## Restricciones
- Sin cambios de SQL, RLS, migraciones, Storage, autenticación, branding, CI, dependencias ni APIs de backend.
- La plataforma administra Git; reportaré el SHA disponible al finalizar, sin ejecutar comandos Git que alteren el estado.
